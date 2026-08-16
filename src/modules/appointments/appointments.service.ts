import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAppointmentDto, UpdateAppointmentStatusDto, FilterAppointmentsDto } from './dto/appointments.dto';
import { AppointmentStatus, NotificationType } from '@prisma/client';
import { isWithinAvailability, PRISMA_DAY_TO_JS } from '../../common/utils/club-time.util';
import { PaymentService } from '../../common/services/payment.service';

// How many minutes before the appointment a patient can still cancel
const CANCELLATION_CUTOFF_MINUTES = 60;

// Valid status transitions from UPCOMING
const ALLOWED_TRANSITIONS: Record<string, AppointmentStatus[]> = {
  UPCOMING: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW, AppointmentStatus.RESCHEDULED],
};

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) { }

  // ── Book an appointment ───────────────────────────────────────────────────────

  async create(userId: string, dto: CreateAppointmentDto) {
    // 1. Resolve patient profile
    const patient = await this.prisma.patient.findUnique({ where: { userId, deletedAt: null } });
    if (!patient) throw new ForbiddenException('Only patients can book appointments');

    // 2. Load doctor
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: dto.doctorId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        clinicName: true,
        addressLine: true,
        city: true,
        country: true,
        consultationPrice: true,
        currency: true,
        isAcceptingNewPatients: true,
        availabilities: { where: { isActive: true } },
        user: { select: { id: true } },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (!doctor.isAcceptingNewPatients) throw new BadRequestException('Doctor is not accepting new patients');

    // 3. Parse scheduled datetime
    const scheduledAt = new Date(dto.scheduledAt);
    if (isNaN(scheduledAt.getTime())) throw new BadRequestException('Invalid scheduledAt datetime');
    if (scheduledAt <= new Date()) throw new BadRequestException('Appointment must be in the future');

    // 4. Verify the slot is within an active availability
    const jsDayOfWeek = scheduledAt.getDay();
    const matchingAvail = doctor.availabilities.find((avail) =>
      isWithinAvailability(
        scheduledAt,
        PRISMA_DAY_TO_JS[avail.dayOfWeek],
        avail.startTime,
        avail.endTime,
        avail.slotMinutes,
      ),
    );
    if (!matchingAvail) {
      throw new BadRequestException('Requested time is not within doctor\'s available slots');
    }

    // 5. Build clinic address snapshot
    const clinicAddressSnapshot = `${doctor.clinicName}, ${doctor.addressLine}, ${doctor.city}, ${doctor.country}`;

    // 6. Process payment (simulated). Require card info in DTO for confirmation.
    const paymentSvc = new PaymentService();
    const card = {
      number: (dto as any).cardNumber,
      expMonth: (dto as any).expMonth,
      expYear: (dto as any).expYear,
      cvc: (dto as any).cvc,
      holderName: (dto as any).cardHolderName,
    };

    const paymentResult = await paymentSvc.processCardPayment(String(doctor.consultationPrice), doctor.currency, card as any);
    if (!paymentResult.success) {
      throw new BadRequestException(`Payment failed: ${paymentResult.reason}`);
    }

    // 7. Create appointment + invoice in a transaction
    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        const appt = await tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            scheduledAt,
            durationMinutes: matchingAvail.slotMinutes,
            clinicAddressSnapshot,
            price: doctor.consultationPrice,
            currency: doctor.currency,
            notes: dto.notes,
          },
          select: {
            id: true,
            scheduledAt: true,
            durationMinutes: true,
            clinicAddressSnapshot: true,
            status: true,
            price: true,
            currency: true,
            notes: true,
            createdAt: true,
            doctor: { select: { id: true, firstName: true, lastName: true } },
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        // Create invoice (paid)
        const count = await tx.invoice.count();
        const invoiceNumber = `INV-${String(count + 1).padStart(6, '0')}`;
        await tx.invoice.create({
          data: {
            appointmentId: appt.id,
            invoiceNumber,
            amount: doctor.consultationPrice,
            currency: doctor.currency,
            status: 'PAID',
            paymentMethod: 'card',
            paidAt: paymentResult.paidAt as Date,
          },
        });

        // Notify doctor
        await tx.notification.create({
          data: {
            userId: doctor.user.id,
            type: NotificationType.APPOINTMENT_CONFIRMED,
            title: 'Nouveau rendez-vous',
            body: `${patient.firstName} ${patient.lastName} a pris rendez-vous le ${scheduledAt.toLocaleDateString('fr-FR')} à ${scheduledAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
          },
        });

        // Notify patient
        await tx.notification.create({
          data: {
            userId,
            type: NotificationType.APPOINTMENT_CONFIRMED,
            title: 'Rendez-vous confirmé',
            body: `Votre RDV avec Dr. ${doctor.firstName} ${doctor.lastName} le ${scheduledAt.toLocaleDateString('fr-FR')} a été enregistré.`,
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'APPOINTMENT_CREATED',
            entityType: 'Appointment',
            entityId: appt.id,
            metadata: { doctorId: doctor.id, scheduledAt: dto.scheduledAt, paymentTx: paymentResult.transactionId },
          },
        });

        return appt;
      });

      return appointment;
    } catch (err: any) {
      // P2002 = unique constraint violated → slot already taken
      if (err?.code === 'P2002') {
        throw new ConflictException('This time slot is already booked');
      }
      throw err;
    }
  }

  // ── List my appointments ──────────────────────────────────────────────────────

  async findMine(userId: string, role: string, filter: FilterAppointmentsDto) {
    const { status, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;

    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({ where: { userId } });
      if (!patient) throw new NotFoundException('Patient profile not found');
      where.patientId = patient.id;
    } else if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      where.doctorId = doctor.id;
    } else {
      // ADMIN sees all
    }

    const [appointments, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        select: {
          id: true,
          scheduledAt: true,
          durationMinutes: true,
          clinicAddressSnapshot: true,
          status: true,
          price: true,
          currency: true,
          notes: true,
          cancelReason: true,
          createdAt: true,
          doctor: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
          patient: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { appointments, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Get single appointment ────────────────────────────────────────────────────

  async findOne(userId: string, role: string, id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: { select: { id: true, firstName: true, lastName: true, userId: true, clinicName: true, city: true } },
        patient: { select: { id: true, firstName: true, lastName: true, userId: true } },
        invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true, paidAt: true } },
        review: { select: { id: true, rating: true, comment: true, createdAt: true } },
      },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    // Access control
    if (role === 'PATIENT' && appointment.patient.userId !== userId)
      throw new ForbiddenException('You do not have access to this appointment');
    if (role === 'DOCTOR' && appointment.doctor.userId !== userId)
      throw new ForbiddenException('You do not have access to this appointment');

    return appointment;
  }

  // ── Update status ─────────────────────────────────────────────────────────────

  async updateStatus(userId: string, role: string, id: string, dto: UpdateAppointmentStatusDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: { select: { id: true, userId: true, patientCount: true } },
        patient: { select: { id: true, userId: true } },
      },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    // Only the doctor of this appointment or an admin may change status
    if (role === 'DOCTOR' && appointment.doctor.userId !== userId)
      throw new ForbiddenException('You can only update status of your own appointments');

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[appointment.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from ${appointment.status} to ${dto.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: { status: dto.status, cancelReason: dto.cancelReason },
        select: { id: true, status: true, cancelReason: true, updatedAt: true, patientId: true, doctorId: true },
      });

      // If COMPLETED → create invoice + increment patientCount
      if (dto.status === AppointmentStatus.COMPLETED) {
        const exists = await tx.invoice.findUnique({ where: { appointmentId: id } });
        if (!exists) {
          const count = await tx.invoice.count();
          const invoiceNumber = `INV-${String(count + 1).padStart(6, '0')}`;
          await tx.invoice.create({
            data: {
              appointmentId: id,
              invoiceNumber,
              amount: appointment.price,
              currency: appointment.currency,
            },
          });
        }

        // Increment doctor's patient count
        await tx.doctor.update({
          where: { id: appointment.doctor.id },
          data: { patientCount: { increment: 1 } },
        });

        // Notify patient
        await tx.notification.create({
          data: {
            userId: appointment.patient.userId,
            type: NotificationType.INVOICE,
            title: 'Consultation terminée — Facture disponible',
            body: 'Votre consultation est terminée. Vous pouvez consulter votre facture dans votre espace.',
          },
        });
      }

      if (dto.status === AppointmentStatus.CANCELLED) {
        // Notify the other party
        const notifyUserId =
          appointment.doctor.userId === userId
            ? appointment.patient.userId
            : appointment.doctor.userId;

        await tx.notification.create({
          data: {
            userId: notifyUserId,
            type: NotificationType.APPOINTMENT_CANCELLED,
            title: 'Rendez-vous annulé',
            body: `Le rendez-vous du ${appointment.scheduledAt.toLocaleDateString('fr-FR')} a été annulé. ${dto.cancelReason ?? ''}`,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: `APPOINTMENT_${dto.status}`,
          entityType: 'Appointment',
          entityId: id,
          metadata: { previousStatus: appointment.status, newStatus: dto.status },
        },
      });

      return appt;
    });

    return updated;
  }

  // ── Cancel by patient ─────────────────────────────────────────────────────────

  async cancelByPatient(userId: string, id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { userId: true } },
        doctor: { select: { userId: true, firstName: true, lastName: true } },
      },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.patient.userId !== userId) throw new ForbiddenException('Not your appointment');
    if (appointment.status !== AppointmentStatus.UPCOMING) {
      throw new BadRequestException('Only UPCOMING appointments can be cancelled');
    }

    // Enforce cancellation cutoff
    const minutesUntilAppt = (appointment.scheduledAt.getTime() - Date.now()) / 60000;
    if (minutesUntilAppt < CANCELLATION_CUTOFF_MINUTES) {
      throw new BadRequestException(
        `Appointments can only be cancelled at least ${CANCELLATION_CUTOFF_MINUTES} minutes in advance`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.CANCELLED, cancelReason: 'Cancelled by patient' },
        select: { id: true, status: true, scheduledAt: true },
      });

      // Notify doctor
      await tx.notification.create({
        data: {
          userId: appointment.doctor.userId,
          type: NotificationType.APPOINTMENT_CANCELLED,
          title: 'Rendez-vous annulé par le patient',
          body: `Le patient a annulé le rendez-vous du ${appointment.scheduledAt.toLocaleDateString('fr-FR')} à ${appointment.scheduledAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'APPOINTMENT_CANCELLED',
          entityType: 'Appointment',
          entityId: id,
          metadata: { cancelledBy: 'PATIENT' },
        },
      });

      return appt;
    });

    return updated;
  }
}
