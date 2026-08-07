import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
