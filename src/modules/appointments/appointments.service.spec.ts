import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';
import { AppointmentStatus } from '@prisma/client';

/** A future Monday at 09:00 (local time). */
function nextMondayAt9(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 1 ? 7 : (1 - day + 7) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 9, 0, 0);
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let m: PrismaMock;

  const doctor = {
    id: 'doc-1',
    firstName: 'A',
    lastName: 'B',
    clinicName: 'Clinic',
    addressLine: '1 st',
    city: 'Paris',
    country: 'FR',
    consultationPrice: 100,
    currency: 'EUR',
    isAcceptingNewPatients: true,
    availabilities: [
      { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '12:00', slotMinutes: 30, isActive: true },
    ],
    user: { id: 'doc-user' },
  };

  const patient = { id: 'pat-1', firstName: 'John', lastName: 'Doe' };

  beforeEach(() => {
    m = createPrismaMock();
    service = new AppointmentsService(m.prisma as any);
  });

  describe('create', () => {
    it('throws ForbiddenException for non-patient users', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { doctorId: 'doc-1', scheduledAt: nextMondayAt9().toISOString(), cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for unknown doctor', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(patient);
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { doctorId: 'doc-x', scheduledAt: nextMondayAt9().toISOString(), cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects doctor not accepting new patients', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(patient);
      m.prisma.doctor.findUnique.mockResolvedValue({ ...doctor, isAcceptingNewPatients: false });

      await expect(
        service.create('user-1', { doctorId: 'doc-1', scheduledAt: nextMondayAt9().toISOString(), cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects past dates', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(patient);
      m.prisma.doctor.findUnique.mockResolvedValue(doctor);

      await expect(
        service.create('user-1', { doctorId: 'doc-1', scheduledAt: '2020-01-01T09:00:00.000Z', cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects times outside available slots', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(patient);
      m.prisma.doctor.findUnique.mockResolvedValue(doctor);
      const monday = nextMondayAt9();
      monday.setHours(12, 30, 0, 0); // after 12:00 end

      await expect(
        service.create('user-1', { doctorId: 'doc-1', scheduledAt: monday.toISOString(), cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the appointment, notifications and audit log', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(patient);
      m.prisma.doctor.findUnique.mockResolvedValue(doctor);
      const appt = { id: 'appt-1', scheduledAt: nextMondayAt9(), status: 'UPCOMING' };
      m.tx.appointment.create.mockResolvedValue(appt);
      m.tx.notification.create.mockResolvedValue({});
      m.tx.auditLog.create.mockResolvedValue({});
      m.tx.invoice.create.mockResolvedValue({});
      m.tx.invoice.count.mockResolvedValue(0);

      const result = await service.create('user-1', {
        doctorId: 'doc-1',
        scheduledAt: nextMondayAt9().toISOString(),
        notes: 'hi',
        cardNumber: '4242424242424242',
        expMonth: 12,
        expYear: 2030,
        cvc: '123',
      });

      expect(result.id).toBe('appt-1');
      expect(m.tx.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'pat-1',
            doctorId: 'doc-1',
            durationMinutes: 30,
            price: 100,
            notes: 'hi',
          }),
        }),
      );
      expect(m.tx.invoice.create).toHaveBeenCalled();
      expect(m.tx.notification.create).toHaveBeenCalledTimes(2);
    });

    it('maps unique constraint errors to ConflictException', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(patient);
      m.prisma.doctor.findUnique.mockResolvedValue(doctor);
      (m.prisma.$transaction as jest.Mock).mockImplementation(async () => {
        const err = new Error('slot taken') as Error & { code: string };
        err.code = 'P2002';
        throw err;
      });

      await expect(
        service.create('user-1', { doctorId: 'doc-1', scheduledAt: nextMondayAt9().toISOString(), cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findMine', () => {
    it('returns patient appointments', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(patient);
      m.prisma.appointment.findMany.mockResolvedValue([{ id: 'appt-1' }]);
      m.prisma.appointment.count.mockResolvedValue(1);

      const result = await service.findMine('user-1', 'PATIENT', {});

      expect(result.appointments).toEqual([{ id: 'appt-1' }]);
      expect(result.meta.total).toBe(1);
      expect(m.prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: 'pat-1' } }),
      );
    });

    it('throws NotFoundException when patient profile is missing', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.findMine('user-1', 'PATIENT', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns doctor appointments for DOCTOR role', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.appointment.findMany.mockResolvedValue([]);
      m.prisma.appointment.count.mockResolvedValue(0);

      await service.findMine('doc-user', 'DOCTOR', {});

      expect(m.prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 'doc-1' } }),
      );
    });
  });

  describe('findOne', () => {
    const appointment = {
      id: 'appt-1',
      doctor: { userId: 'doc-user' },
      patient: { userId: 'user-1' },
    };

    it('throws NotFoundException for unknown appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'PATIENT', 'appt-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids a patient from another patient appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);

      await expect(service.findOne('user-9', 'PATIENT', 'appt-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('forbids a doctor from another doctor appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);

      await expect(service.findOne('other-doc', 'DOCTOR', 'appt-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the appointment when access is granted', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);

      await expect(service.findOne('user-1', 'PATIENT', 'appt-1')).resolves.toEqual(appointment);
    });
  });

  describe('updateStatus', () => {
    const baseAppointment = {
      id: 'appt-1',
      status: AppointmentStatus.UPCOMING,
      scheduledAt: nextMondayAt9(),
      price: 100,
      currency: 'EUR',
      doctor: { id: 'doc-1', userId: 'doc-user', patientCount: 10 },
      patient: { id: 'pat-1', userId: 'user-1' },
    };

    it('throws NotFoundException for unknown appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('doc-user', 'DOCTOR', 'appt-x', { status: AppointmentStatus.COMPLETED }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a doctor updating someone else appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue({ ...baseAppointment, doctor: { userId: 'other' } });

      await expect(
        service.updateStatus('doc-user', 'DOCTOR', 'appt-1', { status: AppointmentStatus.COMPLETED }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects invalid status transitions', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.COMPLETED,
      });

      await expect(
        service.updateStatus('doc-user', 'DOCTOR', 'appt-1', { status: AppointmentStatus.CANCELLED }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates invoice and increments patientCount when COMPLETED', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
      m.tx.appointment.update.mockResolvedValue({ id: 'appt-1', status: 'COMPLETED' });
      m.tx.invoice.findUnique.mockResolvedValue(null);
      m.tx.invoice.count.mockResolvedValue(3);
      m.tx.invoice.create.mockResolvedValue({ id: 'inv-1' });
      m.tx.doctor.update.mockResolvedValue({});
      m.tx.notification.create.mockResolvedValue({});
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.updateStatus('doc-user', 'DOCTOR', 'appt-1', {
        status: AppointmentStatus.COMPLETED,
      });

      expect(result.status).toBe('COMPLETED');
      expect(m.tx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ appointmentId: 'appt-1', invoiceNumber: 'INV-000004' }),
        }),
      );
      expect(m.tx.doctor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { patientCount: { increment: 1 } } }),
      );
    });

    it('notifies the other party when CANCELLED', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
      m.tx.appointment.update.mockResolvedValue({ id: 'appt-1', status: 'CANCELLED' });
      m.tx.notification.create.mockResolvedValue({});
      m.tx.auditLog.create.mockResolvedValue({});

      await service.updateStatus('doc-user', 'DOCTOR', 'appt-1', {
        status: AppointmentStatus.CANCELLED,
        cancelReason: 'Doctor unavailable',
      });

      expect(m.tx.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });
  });

  describe('cancelByPatient', () => {
    const appointment = {
      id: 'appt-1',
      status: AppointmentStatus.UPCOMING,
      scheduledAt: nextMondayAt9(),
      patient: { userId: 'user-1' },
      doctor: { userId: 'doc-user', firstName: 'A', lastName: 'B' },
    };

    it('throws NotFoundException for unknown appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.cancelByPatient('user-1', 'appt-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids cancelling another patient appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue({ ...appointment, patient: { userId: 'other' } });

      await expect(service.cancelByPatient('user-1', 'appt-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects non-UPCOMING appointments', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue({ ...appointment, status: AppointmentStatus.COMPLETED });

      await expect(service.cancelByPatient('user-1', 'appt-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects cancellations inside the 60-minute cutoff', async () => {
      const soon = new Date(Date.now() + 30 * 60 * 1000);
      m.prisma.appointment.findUnique.mockResolvedValue({ ...appointment, scheduledAt: soon });

      await expect(service.cancelByPatient('user-1', 'appt-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('cancels the appointment and notifies the doctor', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);
      m.tx.appointment.update.mockResolvedValue({ id: 'appt-1', status: 'CANCELLED' });
      m.tx.notification.create.mockResolvedValue({});
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.cancelByPatient('user-1', 'appt-1');

      expect(result.status).toBe('CANCELLED');
      expect(m.tx.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'doc-user' }) }),
      );
    });
  });

  describe('reschedule', () => {
    const appointment = {
      id: 'appt-1',
      status: AppointmentStatus.UPCOMING,
      scheduledAt: nextMondayAt9(),
      patient: { id: 'pat-1', userId: 'user-1', firstName: 'John', lastName: 'Doe' },
      doctor: {
        id: 'doc-1',
        userId: 'doc-user',
        firstName: 'A',
        lastName: 'B',
        clinicName: 'Clinic',
        addressLine: '1 st',
        city: 'Paris',
        country: 'FR',
        consultationPrice: 100,
        currency: 'EUR',
        availabilities: [
          { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '12:00', slotMinutes: 30, isActive: true },
        ],
      },
    };

    const newMondayAt9 = new Date(nextMondayAt9().getTime() + 7 * 24 * 60 * 60 * 1000);

    it('throws NotFoundException for unknown appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.reschedule('user-1', 'PATIENT', 'appt-x', { scheduledAt: newMondayAt9.toISOString() }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids users who are neither the patient nor the doctor', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);

      await expect(
        service.reschedule('intruder', 'PATIENT', 'appt-1', { scheduledAt: newMondayAt9.toISOString() }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows either the patient owner or the doctor of the appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);
      m.prisma.appointment.findFirst.mockResolvedValue(null);
      m.tx.appointment.update.mockResolvedValue({ id: 'appt-1', status: AppointmentStatus.RESCHEDULED });
      m.tx.notification.create.mockResolvedValue({});
      m.tx.auditLog.create.mockResolvedValue({});

      for (const [userId, role] of [['user-1', 'PATIENT'], ['doc-user', 'DOCTOR']] as const) {
        const result = await service.reschedule(userId, role, 'appt-1', { scheduledAt: newMondayAt9.toISOString() });
        expect(result.status).toBe(AppointmentStatus.RESCHEDULED);
      }
    });

    it('rejects non-UPCOMING appointments', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue({ ...appointment, status: AppointmentStatus.COMPLETED });

      await expect(
        service.reschedule('user-1', 'PATIENT', 'appt-1', { scheduledAt: newMondayAt9.toISOString() }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects past dates', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);

      await expect(
        service.reschedule('user-1', 'PATIENT', 'appt-1', { scheduledAt: '2020-01-01T09:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a slot outside the doctor availability', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);

      // Saturday 09:00 — outside the MONDAY-only availability
      const saturday = new Date(nextMondayAt9().getTime() + 5 * 24 * 60 * 60 * 1000);

      await expect(
        service.reschedule('user-1', 'PATIENT', 'appt-1', { scheduledAt: saturday.toISOString() }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.prisma.appointment.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a slot already taken by another appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);
      m.prisma.appointment.findFirst.mockResolvedValue({ id: 'appt-other' });

      await expect(
        service.reschedule('user-1', 'PATIENT', 'appt-1', { scheduledAt: newMondayAt9.toISOString() }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates scheduledAt, sets RESCHEDULED, notifies the other party and audits', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(appointment);
      m.prisma.appointment.findFirst.mockResolvedValue(null);
      m.tx.appointment.update.mockResolvedValue({ id: 'appt-1', status: AppointmentStatus.RESCHEDULED });
      m.tx.notification.create.mockResolvedValue({});
      m.tx.auditLog.create.mockResolvedValue({});

      await service.reschedule('user-1', 'PATIENT', 'appt-1', { scheduledAt: newMondayAt9.toISOString() });

      const updateCall = m.tx.appointment.update.mock.calls[0][0];
      expect(updateCall.data.scheduledAt).toEqual(newMondayAt9);
      expect(updateCall.data.status).toBe(AppointmentStatus.RESCHEDULED);
      // snapshot never touched
      expect(updateCall.data.clinicAddressSnapshot).toBeUndefined();
      // doctor is notified when the patient reschedules
      expect(m.tx.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'doc-user' }) }),
      );
      expect(m.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'APPOINTMENT_RESCHEDULED' }) }),
      );
    });
  });
});
