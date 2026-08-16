import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReferentialsService } from './referentials.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('ReferentialsService', () => {
  let service: ReferentialsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new ReferentialsService(m.prisma as any);
  });

  describe('specialties', () => {
    it('creates a specialty with a slug and audits', async () => {
      m.tx.specialty.create.mockResolvedValue({ id: 'spec-1', name: 'Cardiologie', slug: 'cardiologie' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.createSpecialty('admin-1', { name: 'Cardiologie' });

      expect(result.slug).toBe('cardiologie');
      const createCall = m.tx.specialty.create.mock.calls[0][0];
      expect(createCall.data.slug).toBe('cardiologie');
      expect(m.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'SPECIALTY_CREATED' }) }),
      );
    });

    it('rejects duplicate names as ConflictException', async () => {
      m.tx.specialty.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.createSpecialty('admin-1', { name: 'Cardiologie' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('updates a specialty and regenerates the slug when the name changes', async () => {
      m.tx.specialty.findUnique.mockResolvedValue({ id: 'spec-1', name: 'Cardiologie' });
      m.tx.specialty.update.mockResolvedValue({ id: 'spec-1', name: 'Cardiologie interventionnelle' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.updateSpecialty('admin-1', 'spec-1', { name: 'Cardiologie interventionnelle' });

      expect(result.name).toBe('Cardiologie interventionnelle');
      const updateCall = m.tx.specialty.update.mock.calls[0][0];
      expect(updateCall.data.slug).toBe('cardiologie-interventionnelle');
    });

    it('rejects empty updates', async () => {
      await expect(service.updateSpecialty('admin-1', 'spec-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects deletion while doctors are linked', async () => {
      m.prisma.specialty.findUnique.mockResolvedValue({ id: 'spec-1', name: 'Cardiologie' });
      m.prisma.doctor.count.mockResolvedValue(3 as never);

      await expect(service.deleteSpecialty('admin-1', 'spec-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(m.prisma.specialty.delete).not.toHaveBeenCalled();
    });

    it('deletes a specialty with no linked doctors and audits', async () => {
      m.prisma.specialty.findUnique.mockResolvedValue({ id: 'spec-1', name: 'Cardiologie' });
      m.prisma.doctor.count.mockResolvedValue(0 as never);
      m.prisma.specialty.delete.mockResolvedValue({} as never);
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.deleteSpecialty('admin-1', 'spec-1');

      expect(result.message).toContain('deleted');
      expect(m.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'SPECIALTY_DELETED' }) }),
      );
    });
  });

  describe('languages', () => {
    it('creates a language with a normalized code and audits', async () => {
      m.tx.language.create.mockResolvedValue({ id: 'lang-1', name: 'Français', code: 'fr' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.createLanguage('admin-1', { name: 'Français', code: 'FR' });

      expect(result.code).toBe('fr');
      const createCall = m.tx.language.create.mock.calls[0][0];
      expect(createCall.data.code).toBe('fr');
    });

    it('unlinks doctor associations before deleting a language', async () => {
      m.prisma.language.findUnique.mockResolvedValue({ id: 'lang-1', name: 'Français' });
      m.prisma.doctorLanguage.deleteMany.mockResolvedValue({ count: 2 });
      m.prisma.language.delete.mockResolvedValue({} as never);
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      await service.deleteLanguage('admin-1', 'lang-1');

      expect(m.prisma.doctorLanguage.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { languageId: 'lang-1' } }),
      );
      expect(m.prisma.language.delete).toHaveBeenCalled();
    });
  });

  describe('focus areas', () => {
    it('creates a focus area', async () => {
      m.tx.focusArea.create.mockResolvedValue({ id: 'fa-1', name: 'Médecine du sport' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.createFocusArea('admin-1', { name: 'Médecine du sport' });

      expect(result.name).toBe('Médecine du sport');
      expect(m.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'FOCUS_AREA_CREATED' }) }),
      );
    });

    it('unlinks doctor associations before deleting a focus area', async () => {
      m.prisma.focusArea.findUnique.mockResolvedValue({ id: 'fa-1', name: 'Médecine du sport' });
      m.prisma.doctorFocusArea.deleteMany.mockResolvedValue({ count: 1 });
      m.prisma.focusArea.delete.mockResolvedValue({} as never);
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      await service.deleteFocusArea('admin-1', 'fa-1');

      expect(m.prisma.doctorFocusArea.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { focusAreaId: 'fa-1' } }),
      );
      expect(m.prisma.focusArea.delete).toHaveBeenCalled();
    });
  });
});