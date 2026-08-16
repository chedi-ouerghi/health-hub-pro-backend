import { ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new InvoicesService(m.prisma as any);
  });

  describe('findMine', () => {
    it('returns patient invoices', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      m.prisma.invoice.findMany.mockResolvedValue([{ id: 'inv-1' }]);
      m.prisma.invoice.count.mockResolvedValue(1);

      const result = await service.findMine('user-1', 'PATIENT', {});

      expect(result.invoices).toEqual([{ id: 'inv-1' }]);
      expect(m.prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { appointment: { patientId: 'pat-1' } } }),
      );
    });

    it('returns doctor invoices for DOCTOR role', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.invoice.findMany.mockResolvedValue([]);
      m.prisma.invoice.count.mockResolvedValue(0);

      const result = await service.findMine('doc-user', 'DOCTOR', {});

      expect(result.invoices).toEqual([]);
      expect(m.prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { appointment: { doctorId: 'doc-1' } } }),
      );
    });
  });

  describe('findOne', () => {
    const invoice = {
      id: 'inv-1',
      appointment: { patient: { id: 'pat-1' }, doctor: { id: 'doc-1' } },
    };

    it('throws NotFoundException for unknown invoice', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'PATIENT', 'inv-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids a patient from another patient invoice', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(invoice);
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-9' });

      await expect(service.findOne('user-9', 'PATIENT', 'inv-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the invoice for the owning patient', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(invoice);
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });

      await expect(service.findOne('user-1', 'PATIENT', 'inv-1')).resolves.toEqual(invoice);
    });
  });

  describe('markPaid', () => {
    it('throws NotFoundException for unknown invoice', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.markPaid('inv-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks the invoice as paid', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'PENDING' });
      const paid = { id: 'inv-1', status: 'PAID' };
      m.prisma.invoice.update.mockResolvedValue(paid);

      const result = await service.markPaid('inv-1');

      expect(result).toEqual(paid);
      expect(m.prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }) }),
      );
    });
  });

  describe('create', () => {
    it('forbids non-admin creation', async () => {
      await expect(service.create('user-1', 'PATIENT', { appointmentId: 'appt-1' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for unknown appointment', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.create('admin-1', 'ADMIN', { appointmentId: 'appt-x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when invoice already exists', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue({ id: 'appt-1', price: '150', currency: 'USD' });
      m.prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1' });

      await expect(
        service.create('admin-1', 'ADMIN', { appointmentId: 'appt-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates invoice with amount from appointment + audit', async () => {
      m.prisma.appointment.findUnique.mockResolvedValue({ id: 'appt-1', price: '150', currency: 'USD' });
      m.prisma.invoice.findUnique.mockResolvedValue(null);
      m.tx.invoice.count.mockResolvedValue(3);
      m.tx.invoice.create.mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-000004' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.create('admin-1', 'ADMIN', { appointmentId: 'appt-1' });

      expect(result.invoiceNumber).toBe('INV-000004');
      expect(m.tx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            appointmentId: 'appt-1',
            amount: '150',
            currency: 'USD',
            invoiceNumber: 'INV-000004',
          }),
        }),
      );
    });
  });

  describe('refund', () => {
    it('throws NotFoundException for unknown invoice', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.refund('admin-1', 'inv-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects already refunded invoices', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'REFUNDED', amount: '100' });

      await expect(service.refund('admin-1', 'inv-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects FAILED invoices', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'FAILED', amount: '100' });

      await expect(service.refund('admin-1', 'inv-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refunds a PAID invoice and audits', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'PAID', amount: '100' });
      m.tx.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'REFUNDED' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.refund('admin-1', 'inv-1');

      expect(result.status).toBe('REFUNDED');
      expect(m.tx.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REFUNDED' } }),
      );
      expect(m.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'INVOICE_REFUNDED' }) }),
      );
    });
  });

  describe('generatePdf', () => {
    const baseInvoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-000001',
      amount: '150',
      currency: 'USD',
      status: 'PAID',
      createdAt: new Date('2026-08-01'),
      appointment: {
        id: 'appt-1',
        scheduledAt: new Date('2026-08-15T09:00:00Z'),
        clinicAddressSnapshot: 'Clinic, 1 st, Paris',
        notes: null,
        doctor: { id: 'doc-1', firstName: 'A', lastName: 'B', clinicName: 'Clinic', city: 'Paris' },
        patient: { id: 'pat-1', firstName: 'C', lastName: 'D' },
      },
    };

    it('throws NotFoundException for unknown invoice', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.generatePdf('user-1', 'PATIENT', 'inv-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids a patient from another patient invoice PDF', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(baseInvoice);
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-9' });

      await expect(service.generatePdf('user-9', 'PATIENT', 'inv-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('generates a valid PDF buffer for the owner', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(baseInvoice);
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });

      const { buffer, filename } = await service.generatePdf('user-1', 'PATIENT', 'inv-1');

      expect(filename).toBe('INV-000001.pdf');
      expect(buffer.length).toBeGreaterThan(100);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('allows admin to download any invoice PDF', async () => {
      m.prisma.invoice.findUnique.mockResolvedValue(baseInvoice);

      const { filename } = await service.generatePdf('admin-1', 'ADMIN', 'inv-1');

      expect(filename).toBe('INV-000001.pdf');
    });
  });
});
