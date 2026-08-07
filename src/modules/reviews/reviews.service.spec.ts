import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';
import { AppointmentStatus } from '@prisma/client';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new ReviewsService(m.prisma as any);
  });

  describe('create', () => {
    it('throws ForbiddenException for non-patient users', async () => {
      m.prisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { appointmentId: 'appt-1', rating: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for unknown appointment', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      m.prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { appointmentId: 'appt-x', rating: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids reviewing someone else appointment', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      m.prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        patientId: 'pat-9',
        doctorId: 'doc-1',
        status: AppointmentStatus.COMPLETED,
        review: null,
      });

      await expect(
        service.create('user-1', { appointmentId: 'appt-1', rating: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('only allows reviews on COMPLETED appointments', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      m.prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        status: AppointmentStatus.UPCOMING,
        review: null,
      });

      await expect(
        service.create('user-1', { appointmentId: 'appt-1', rating: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate reviews for the same appointment', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      m.prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        status: AppointmentStatus.COMPLETED,
        review: { id: 'r-1' },
      });

      await expect(
        service.create('user-1', { appointmentId: 'appt-1', rating: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the review and recomputes doctor rating stats', async () => {
      m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
      m.prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        status: AppointmentStatus.COMPLETED,
        review: null,
      });
      m.tx.review.create.mockResolvedValue({ id: 'r-1', rating: 5 });
      m.tx.review.findMany.mockResolvedValue([{ rating: 5 }, { rating: 4 }]);
      m.tx.doctor.update.mockResolvedValue({});
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.create('user-1', { appointmentId: 'appt-1', rating: 5, comment: 'Great' });

      expect(result.id).toBe('r-1');
      expect(m.tx.doctor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: expect.objectContaining({ ratingAverage: 4.5, reviewCount: 2, recommendationRate: 100 }),
        }),
      );
      expect(m.tx.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('getDoctorReviews', () => {
    it('throws NotFoundException when doctor is missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getDoctorReviews('doc-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns paginated reviews', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.review.findMany.mockResolvedValue([{ id: 'r-1', rating: 4 }]);
      m.prisma.review.count.mockResolvedValue(1);

      const result = await service.getDoctorReviews('doc-1');

      expect(result.reviews).toEqual([{ id: 'r-1', rating: 4 }]);
      expect(result.meta.total).toBe(1);
    });
  });
});
