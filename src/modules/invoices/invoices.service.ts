import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FilterInvoicesDto, CreateInvoiceDto } from './dto/invoices.dto';
import { InvoiceStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';

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

    await this._assertAccess(userId, role, invoice);

    return invoice;
  }

  /**
   * Internal: create an invoice linked to an appointment (admin / system only).
   * Amount & currency are taken from the appointment snapshot.
   */
  async create(userId: string, requesterRole: string, dto: CreateInvoiceDto) {
    if (requesterRole !== 'ADMIN' && requesterRole !== 'SUPER_ADMIN' && requesterRole !== 'SYSTEM') {
      throw new ForbiddenException('Only admins or internal services can create invoices');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      select: { id: true, price: true, currency: true },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const existing = await this.prisma.invoice.findUnique({
      where: { appointmentId: dto.appointmentId },
    });
    if (existing) throw new ConflictException('An invoice already exists for this appointment');

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.invoice.count();
      const invoice = await tx.invoice.create({
        data: {
          appointmentId: appointment.id,
          invoiceNumber: `INV-${String(count + 1).padStart(6, '0')}`,
          amount: appointment.price,
          currency: appointment.currency,
          paymentMethod: dto.paymentMethod,
        },
        include: this.INVOICE_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'INVOICE_CREATED',
          entityType: 'Invoice',
          entityId: invoice.id,
          metadata: { appointmentId: appointment.id, amount: String(appointment.price) },
        },
      });

      return invoice;
    });
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

  /** Refund an invoice — ADMIN only. Only PENDING / PAID invoices can be refunded. */
  async refund(adminUserId: string, id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.status === InvoiceStatus.REFUNDED) {
      throw new BadRequestException('Invoice has already been refunded');
    }
    if (invoice.status === InvoiceStatus.FAILED) {
      throw new BadRequestException('Cannot refund a FAILED invoice');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.REFUNDED },
        include: this.INVOICE_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'INVOICE_REFUNDED',
          entityType: 'Invoice',
          entityId: id,
          metadata: { previousStatus: invoice.status, amount: String(invoice.amount) },
        },
      });

      return updated;
    });
  }

  /** Generate a printable PDF for an invoice (owner or admin). */
  async generatePdf(userId: string, role: string, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        appointment: {
          select: {
            id: true,
            scheduledAt: true,
            clinicAddressSnapshot: true,
            notes: true,
            doctor: { select: { firstName: true, lastName: true, clinicName: true, city: true } },
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    await this._assertAccess(userId, role, invoice as any);

    const buffer = await this._buildPdfBuffer(invoice);
    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _assertAccess(userId: string, role: string, invoice: any) {
    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({ where: { userId } });
      if (invoice.appointment.patient.id !== patient?.id)
        throw new ForbiddenException('Not your invoice');
    } else if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (invoice.appointment.doctor.id !== doctor?.id)
        throw new ForbiddenException('Not your invoice');
    }
    // ADMIN / SUPER_ADMIN sees all
  }

  private _buildPdfBuffer(invoice: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { appointment } = invoice;
      const doctor = appointment?.doctor ?? {};
      const patient = appointment?.patient ?? {};

      // Header
      doc.fontSize(20).fillColor('#1a1a2e').text('Health Hub Pro', { continued: false });
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#666666').text(`Facture ${invoice.invoiceNumber}`);
      doc.fontSize(10).text(`Date d'émission : ${invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('fr-FR') : ''}`);

      doc.moveDown(1);

      // Doctor / clinic block
      doc.fontSize(12).fillColor('#1a1a2e').text('Médecin');
      doc.fontSize(10).fillColor('#333333').text(`Dr. ${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`);
      if (appointment?.clinicAddressSnapshot) doc.text(appointment.clinicAddressSnapshot);
      doc.moveDown(0.8);

      // Patient block
      doc.fontSize(12).fillColor('#1a1a2e').text('Patient');
      doc.fontSize(10).fillColor('#333333').text(`${patient.firstName ?? ''} ${patient.lastName ?? ''}`);
      doc.moveDown(0.8);

      // Appointment block
      doc.fontSize(12).fillColor('#1a1a2e').text('Rendez-vous');
      doc.fontSize(10).fillColor('#333333').text(
        appointment?.scheduledAt ? new Date(appointment.scheduledAt).toLocaleString('fr-FR') : '',
      );
      if (appointment?.notes) doc.text(`Notes : ${appointment.notes}`);
      doc.moveDown(1);

      // Amount box
      doc.roundedRect(50, doc.y, 495, 60, 6).strokeColor('#1a1a2e').lineWidth(1).stroke();
      doc.fontSize(26).fillColor('#1a1a2e').text(
        `${invoice.amount} ${invoice.currency}`,
        60,
        doc.y + 12,
        { width: 475, align: 'right' },
      );
      doc.fontSize(10).fillColor('#666666').text(
        `Statut : ${invoice.status}`,
        60,
        doc.y + 24,
        { width: 475, align: 'right' },
      );

      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999999').text(
        'Document généré automatiquement — ne pas répondre à ce document.',
      );

      doc.end();
    });
  }
}