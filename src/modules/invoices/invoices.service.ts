import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FilterInvoicesDto } from './dto/invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly INVOICE_INCLUDE = {
    appointment: {
      select: {
        id: true,
        scheduledAt: true,
        clinicAddressSnapshot: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    },
  };

  async findMine(userId: string, role: string, filter: FilterInvoicesDto) {
    const { status, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({ where: { userId } });
      if (!patient) throw new NotFoundException('Patient profile not found');
      where.appointment = { patientId: patient.id };
    } else if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      where.appointment = { doctorId: doctor.id };
    }
    // ADMIN sees all

    const [invoices, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.INVOICE_INCLUDE,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { invoices, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(userId: string, role: string, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.INVOICE_INCLUDE,
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    // Access control
    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({ where: { userId } });
      if (invoice.appointment.patient.id !== patient?.id)
        throw new ForbiddenException('Not your invoice');
    } else if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (invoice.appointment.doctor.id !== doctor?.id)
        throw new ForbiddenException('Not your invoice');
    }

    return invoice;
  }

  /**
   * Mark invoice as paid — ADMIN only.
   * In a real system this would be triggered by a payment gateway webhook.
   */
  async markPaid(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
      include: this.INVOICE_INCLUDE,
    });
  }
}
