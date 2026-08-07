import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('DoctorsService', () => {
  let service: DoctorsService;
  let m: PrismaMock;

  const doctor = { id: 'doc-1', firstName: 'A', lastName: 'B' };

  beforeEach(() => {
    m = createPrismaMock();
    service = new DoctorsService(m.prisma as any);
  });

  describe('findAll', () => {
    it('returns paginated doctors', async () => {
      m.prisma.doctor.findMany.mockResolvedValue([doctor]);
      m.prisma.doctor.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.doctors).toEqual([doctor]);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('filters by specialty, city and accepting new patients', async () => {
      m.prisma.doctor.findMany.mockResolvedValue([]);
      m.prisma.doctor.count.mockResolvedValue(0);

      await service.findAll({
        specialtyId: 'spec-1',
        city: 'Paris',
        isAcceptingNewPatients: true,
        page: 2,
        limit: 10,
      });

      expect(m.prisma.doctor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            specialtyId: 'spec-1',
            city: { contains: 'Paris', mode: 'insensitive' },
            isAcceptingNewPatients: true,
          }),
          skip: 10,
          take: 10,
        }),
      );
    });

    it('adds today availability filter when availableToday is true', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3, 12, 0, 0)); // Monday
      m.prisma.doctor.findMany.mockResolvedValue([]);
      m.prisma.doctor.count.mockResolvedValue(0);

      await service.findAll({ availableToday: true });

      expect(m.prisma.doctor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            availabilities: { some: { dayOfWeek: 'MONDAY', isActive: true } },
          }),
        }),
      );
      jest.useRealTimers();
    });
  });

  describe('findOne', () => {
    it('returns a doctor by id', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(doctor);

      await expect(service.findOne('doc-1')).resolves.toEqual(doctor);
    });

    it('throws NotFoundException for unknown doctor', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.findOne('doc-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMyProfile', () => {
    it('throws NotFoundException when doctor profile is missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.updateMyProfile('user-x', { bio: 'hi' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('parses consultation price and updates', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(doctor);
      m.prisma.doctor.update.mockResolvedValue({ ...doctor, consultationPrice: 200 });

      const result = await service.updateMyProfile('user-1', {
        bio: 'hi',
        consultationPrice: '200.00',
        isAcceptingNewPatients: true,
      });

      expect(m.prisma.doctor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          data: expect.objectContaining({ consultationPrice: 200, isAcceptingNewPatients: true }),
        }),
      );
      expect(result.consultationPrice).toBe(200);
    });
  });

  describe('getAvailabilities', () => {
    it('throws NotFoundException when doctor is missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getAvailabilities('doc-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns availabilities for an existing doctor', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.availability.findMany.mockResolvedValue([{ id: 'av-1', dayOfWeek: 'MONDAY' }]);

      const result = await service.getAvailabilities('doc-1');

      expect(result).toHaveLength(1);
      expect(m.prisma.availability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 'doc-1' } }),
      );
    });
  });

  describe('createAvailability', () => {
    it('throws NotFoundException when doctor profile is missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.createAvailability('user-x', {
          dayOfWeek: 'MONDAY',
          startTime: '09:00',
          endTime: '12:00',
          slotMinutes: 30,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when slots overlap', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.availability.findMany.mockResolvedValue([
        { startTime: '10:00', endTime: '11:00' },
      ]);

      await expect(
        service.createAvailability('user-1', {
          dayOfWeek: 'MONDAY',
          startTime: '09:00',
          endTime: '12:00',
          slotMinutes: 30,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a non-overlapping slot', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.availability.findMany.mockResolvedValue([{ startTime: '13:00', endTime: '15:00' }]);
      const created = { id: 'av-2', dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '12:00' };
      m.prisma.availability.create.mockResolvedValue(created);

      const result = await service.createAvailability('user-1', {
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        endTime: '12:00',
      });

      expect(result).toEqual(created);
      expect(m.prisma.availability.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slotMinutes: 30 }) }),
      );
    });
  });

  describe('updateAvailability', () => {
    it('throws ForbiddenException for another doctor slot', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.availability.findUnique.mockResolvedValue({
        id: 'av-1',
        doctorId: 'doc-2',
        startTime: '09:00',
        endTime: '12:00',
        slotMinutes: 30,
        dayOfWeek: 'MONDAY',
      });

      await expect(
        service.updateAvailability('user-1', 'av-1', { startTime: '10:00' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates own slot', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.availability.findUnique.mockResolvedValue({
        id: 'av-1',
        doctorId: 'doc-1',
        startTime: '09:00',
        endTime: '12:00',
        slotMinutes: 30,
        dayOfWeek: 'MONDAY',
      });
      m.prisma.availability.update.mockResolvedValue({ id: 'av-1', startTime: '10:00' });

      const result = await service.updateAvailability('user-1', 'av-1', { startTime: '10:00' });

      expect(result.startTime).toBe('10:00');
    });
  });

  describe('deleteAvailability', () => {
    it('throws ForbiddenException for another doctor slot', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.availability.findUnique.mockResolvedValue({
        id: 'av-1',
        doctorId: 'doc-2',
        startTime: '09:00',
        endTime: '12:00',
        slotMinutes: 30,
        dayOfWeek: 'MONDAY',
      });

      await expect(service.deleteAvailability('user-1', 'av-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('deletes own slot', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.availability.findUnique.mockResolvedValue({
        id: 'av-1',
        doctorId: 'doc-1',
        startTime: '09:00',
        endTime: '12:00',
        slotMinutes: 30,
        dayOfWeek: 'MONDAY',
      });
      m.prisma.availability.delete.mockResolvedValue({ id: 'av-1' });

      const result = await service.deleteAvailability('user-1', 'av-1');

      expect(result.message).toContain('deleted');
      expect(m.prisma.availability.delete).toHaveBeenCalledWith({ where: { id: 'av-1' } });
    });
  });

  describe('getDoctorReviews', () => {
    it('throws NotFoundException when doctor is missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getDoctorReviews('doc-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns paginated reviews', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.review.findMany.mockResolvedValue([{ id: 'r-1', rating: 5 }]);
      m.prisma.review.count.mockResolvedValue(1);

      const result = await service.getDoctorReviews('doc-1');

      expect(result.reviews).toEqual([{ id: 'r-1', rating: 5 }]);
      expect(result.meta.total).toBe(1);
    });
  });
});
