import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('UsersService', () => {
  let service: UsersService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new UsersService(m.prisma as any);
  });

  describe('getMe', () => {
    it('returns the current user profile', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.io',
        role: 'PATIENT',
        patient: { firstName: 'John', lastName: 'Doe' },
      };
      m.prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getMe('user-1', 'PATIENT');

      expect(result).toEqual(user);
      expect(m.prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1', deletedAt: null } }),
      );
    });

    it('throws NotFoundException when user is missing', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('nobody', 'PATIENT')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('updates patient profile for PATIENT role', async () => {
      const updated = { id: 'pat-1', firstName: 'John', lastName: 'Doe', gender: 'MALE' };
      m.prisma.patient.update.mockResolvedValue(updated);

      const result = await service.updateMe('user-1', 'PATIENT', {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-05-15',
        gender: 'MALE',
      });

      expect(result).toEqual(updated);
      expect(m.prisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          data: expect.objectContaining({ dateOfBirth: expect.any(Date) }),
        }),
      );
    });

    it('parses consultation price for DOCTOR role', async () => {
      const updated = { id: 'doc-1', firstName: 'A', consultationPrice: 150 };
      m.prisma.doctor.update.mockResolvedValue(updated);

      const result = await service.updateMe('user-2', 'DOCTOR', {
        firstName: 'A',
        consultationPrice: '150.50',
      });

      expect(result).toEqual(updated);
      expect(m.prisma.doctor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ consultationPrice: 150.5 }) }),
      );
    });

    it('throws ForbiddenException for unsupported roles', async () => {
      await expect(service.updateMe('user-1', 'ADMIN', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
