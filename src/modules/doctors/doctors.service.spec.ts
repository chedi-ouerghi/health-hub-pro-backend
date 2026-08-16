import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
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

  describe('search', () => {
    it('returns paginated search results', async () => {
      m.prisma.doctor.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      m.prisma.doctor.count.mockResolvedValue(1);

      const result = await service.search({});

      expect(result.doctors).toEqual([{ id: 'doc-1' }]);
      expect(result.meta.total).toBe(1);
    });

    it('builds combined filters (query, city, price range, language, sort)', async () => {
      m.prisma.doctor.findMany.mockResolvedValue([]);
      m.prisma.doctor.count.mockResolvedValue(0);

      await service.search({
        query: 'martin',
        city: 'Paris',
        language: 'fr',
        minPrice: 100,
        maxPrice: 300,
        sort: 'price',
        order: 'asc',
      });

      expect(m.prisma.doctor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { firstName: { contains: 'martin', mode: 'insensitive' } },
            ]),
            city: { contains: 'Paris', mode: 'insensitive' },
            languages: {
              some: { language: { OR: expect.any(Array) } },
            },
            consultationPrice: { gte: 100, lte: 300 },
          }),
          orderBy: { consultationPrice: 'asc' },
        }),
      );
    });

    it('throws BadRequestException when minPrice > maxPrice', async () => {
      await expect(
        service.search({ minPrice: 300, maxPrice: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('matches specialty by id, slug or name', async () => {
      m.prisma.doctor.findMany.mockResolvedValue([]);
      m.prisma.doctor.count.mockResolvedValue(0);

      await service.search({ specialty: 'cardio' });

      expect(m.prisma.doctor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            specialty: {
              OR: [
                { id: 'cardio' },
                { slug: { equals: 'cardio', mode: 'insensitive' } },
                { name: { contains: 'cardio', mode: 'insensitive' } },
              ],
            },
          }),
        }),
      );
    });
  });

  describe('education', () => {
    it('getDoctorEducations returns paginated list', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.education.findMany.mockResolvedValue([{ id: 'e-1', school: 'Univ Paris' }]);
      m.prisma.education.count.mockResolvedValue(1);

      const result = await service.getDoctorEducations('doc-1');

      expect(result.educations).toEqual([{ id: 'e-1', school: 'Univ Paris' }]);
      expect(result.meta.total).toBe(1);
    });

    it('getDoctorEducations throws for unknown doctor', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.getDoctorEducations('doc-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('createEducation requires a doctor profile and audits', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.tx.education.create.mockResolvedValue({ id: 'e-1' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.createEducation('user-1', { school: 'Univ Paris', degree: 'MD', startYear: 2005 });

      expect(result.id).toBe('e-1');
      expect(m.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'EDUCATION_CREATED' }) }),
      );
    });

    it('updateEducation forbids another doctor record', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.education.findUnique.mockResolvedValue({ id: 'e-1', doctorId: 'doc-2' });

      await expect(
        service.updateEducation('user-1', 'e-1', { school: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updateEducation updates own record', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.education.findUnique.mockResolvedValue({ id: 'e-1', doctorId: 'doc-1' });
      m.prisma.education.update.mockResolvedValue({ id: 'e-1', school: 'X' });

      const result = await service.updateEducation('user-1', 'e-1', { school: 'X' });

      expect(result.school).toBe('X');
    });

    it('deleteEducation deletes own record and audits', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.education.findUnique.mockResolvedValue({ id: 'e-1', doctorId: 'doc-1' });
      m.prisma.education.delete.mockResolvedValue({});
      m.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.deleteEducation('user-1', 'e-1');

      expect(result.message).toContain('deleted');
    });
  });

  describe('certificates', () => {
    it('getDoctorCertificates returns paginated list', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.certificate.findMany.mockResolvedValue([{ id: 'c-1', name: 'Board' }]);
      m.prisma.certificate.count.mockResolvedValue(1);

      const result = await service.getDoctorCertificates('doc-1');

      expect(result.certificates).toEqual([{ id: 'c-1', name: 'Board' }]);
    });

    it('createCertificate parses issuedAt and audits', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.tx.certificate.create.mockResolvedValue({ id: 'c-1' });
      m.tx.auditLog.create.mockResolvedValue({});

      await service.createCertificate('user-1', { name: 'Board', issuedBy: 'ABMS', issuedAt: '2020-06-15' });

      expect(m.tx.certificate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Board', issuedAt: expect.any(Date) }),
        }),
      );
    });

    it('updateCertificate forbids another doctor certificate', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.certificate.findUnique.mockResolvedValue({ id: 'c-1', doctorId: 'doc-2' });

      await expect(
        service.updateCertificate('user-1', 'c-1', { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('deleteCertificate deletes and audits', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.certificate.findUnique.mockResolvedValue({ id: 'c-1', doctorId: 'doc-1' });
      m.prisma.certificate.delete.mockResolvedValue({});
      m.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.deleteCertificate('user-1', 'c-1');

      expect(result.message).toContain('deleted');
    });
  });

  describe('focus areas', () => {
    it('getDoctorFocusAreas returns relations', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.doctorFocusArea.findMany.mockResolvedValue([{ focusArea: { id: 'fa-1', name: 'Pediatrics' } }]);

      const result = await service.getDoctorFocusAreas('doc-1');

      expect(result).toHaveLength(1);
    });

    it('addFocusArea throws NotFound when focus area is missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.focusArea.findUnique.mockResolvedValue(null);

      await expect(service.addFocusArea('user-1', { focusAreaId: 'fa-x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('addFocusArea creates relation + audit', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.focusArea.findUnique.mockResolvedValue({ id: 'fa-1' });
      m.tx.doctorFocusArea.create.mockResolvedValue({ focusArea: { id: 'fa-1', name: 'Cardio' } });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.addFocusArea('user-1', { focusAreaId: 'fa-1' });

      expect(result.focusArea.id).toBe('fa-1');
    });

    it('addFocusArea maps P2002 to ConflictException', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.focusArea.findUnique.mockResolvedValue({ id: 'fa-1' });
      m.tx.doctorFocusArea.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.addFocusArea('user-1', { focusAreaId: 'fa-1' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('removeFocusArea throws NotFound when relation missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.doctorFocusArea.findUnique.mockResolvedValue(null);

      await expect(service.removeFocusArea('user-1', 'fa-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removeFocusArea deletes relation + audit', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.doctorFocusArea.findUnique.mockResolvedValue({ doctorId: 'doc-1', focusAreaId: 'fa-1' });
      m.prisma.doctorFocusArea.deleteMany.mockResolvedValue({ count: 1 });
      m.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.removeFocusArea('user-1', 'fa-1');

      expect(result.message).toContain('removed');
      expect(m.prisma.doctorFocusArea.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 'doc-1', focusAreaId: 'fa-1' } }),
      );
    });
  });

  describe('languages', () => {
    it('getDoctorLanguages returns relations', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.doctorLanguage.findMany.mockResolvedValue([{ language: { id: 'l-1', name: 'French', code: 'fr' } }]);

      const result = await service.getDoctorLanguages('doc-1');

      expect(result).toHaveLength(1);
    });

    it('addLanguage throws NotFound when language is missing', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.language.findUnique.mockResolvedValue(null);

      await expect(service.addLanguage('user-1', { languageId: 'l-x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('addLanguage creates relation + audit', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.language.findUnique.mockResolvedValue({ id: 'l-1' });
      m.tx.doctorLanguage.create.mockResolvedValue({ language: { id: 'l-1', name: 'French', code: 'fr' } });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.addLanguage('user-1', { languageId: 'l-1' });

      expect(result.language.id).toBe('l-1');
    });

    it('removeLanguage deletes relation + audit', async () => {
      m.prisma.doctor.findUnique.mockResolvedValue({ id: 'doc-1' });
      m.prisma.doctorLanguage.findUnique.mockResolvedValue({ doctorId: 'doc-1', languageId: 'l-1' });
      m.prisma.doctorLanguage.deleteMany.mockResolvedValue({ count: 1 });
      m.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.removeLanguage('user-1', 'l-1');

      expect(result.message).toContain('removed');
    });
  });
});
