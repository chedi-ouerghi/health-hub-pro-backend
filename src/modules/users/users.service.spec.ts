import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { EmailVerificationService } from '../../common/services/email-verification.service';
import { encryptSecret } from '../../common/utils/crypto.utils';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';
import { UsersService } from './users.service';

jest.mock('../../common/utils/hash.utils', () => ({
  hashPassword: jest.fn(async (p: string) => `hashed-${p}`),
  verifyPassword: jest.fn(),
  hashToken: jest.fn((t: string) => `hashed-${t}`),
}));
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
  generateURI: jest.fn(() => 'otpauth://totp/Health%20Hub%20Pro:a%40b.io?secret=JBSWY3DPEHPK3PXP&issuer=Health%20Hub%20Pro'),
  verify: jest.fn(async () => ({ valid: true })),
}));
// qrcode is CJS-compatible, loaded for real
import { verify as verifyTotp } from 'otplib';
import { hashPassword, verifyPassword } from '../../common/utils/hash.utils';

const ENCRYPTION_KEY = 'a'.repeat(64);

describe('UsersService', () => {
  let service: UsersService;
  let m: PrismaMock;
  let emailVerification: { requestCode: jest.Mock; verifyCode: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    m = createPrismaMock();
    emailVerification = { requestCode: jest.fn(), verifyCode: jest.fn() };
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, unknown> = {
          NODE_ENV: 'test',
          TWO_FACTOR_ENCRYPTION_KEY: ENCRYPTION_KEY,
          JWT_SECRET: 'jwt-secret',
        };
        return map[key];
      }),
    };
    service = new UsersService(m.prisma as any, emailVerification as unknown as EmailVerificationService, config as any);
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it('returns the current user profile', async () => {
      const user = {
        id: 'user-1',
        email: 'a@b.io',
        role: 'PATIENT',
        twoFactorEnabled: false,
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

  describe('getMySessions', () => {
    it('lists active sessions with pagination meta', async () => {
      m.prisma.session.findMany.mockResolvedValue([{ id: 'sess-1' }] as never);
      m.prisma.session.count.mockResolvedValue(1 as never);

      const result = await service.getMySessions('user-1', {});

      expect(result.sessions).toEqual([{ id: 'sess-1' }]);
      expect(result.meta.total).toBe(1);
      expect(m.prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', revokedAt: null }),
        }),
      );
    });
  });

  describe('revokeMySession', () => {
    it('revokes a session belonging to the user and its bound refresh token', async () => {
      m.prisma.session.findUnique.mockResolvedValue({
        id: 'sess-2',
        userId: 'user-1',
        tokenHash: 'hashed-rt',
        revokedAt: null,
      } as never);
      m.prisma.session.update.mockResolvedValue({} as never);
      m.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as never);
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      await service.revokeMySession('user-1', 'sess-2', 'sess-1');

      expect(m.prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess-2' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(m.prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tokenHash: 'hashed-rt' }) }),
      );
      expect(m.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'SESSION_REVOKED' }) }),
      );
    });

    it('rejects revocation of another user session', async () => {
      m.prisma.session.findUnique.mockResolvedValue({
        id: 'sess-9',
        userId: 'other-user',
        tokenHash: 'x',
      } as never);

      await expect(service.revokeMySession('user-1', 'sess-9', 'sess-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids revoking the current session', async () => {
      m.prisma.session.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId: 'user-1',
        tokenHash: 'x',
        revokedAt: null,
      } as never);

      await expect(service.revokeMySession('user-1', 'sess-1', 'sess-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.prisma.session.update).not.toHaveBeenCalled();
    });

    it('rejects an already-revoked session', async () => {
      m.prisma.session.findUnique.mockResolvedValue({
        id: 'sess-3',
        userId: 'user-1',
        tokenHash: 'x',
        revokedAt: new Date(),
      } as never);

      await expect(service.revokeMySession('user-1', 'sess-3', 'sess-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('changePassword', () => {
    it('rejects wrong current password', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', password: 'hash' } as never);
      (verifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', 'sess-1', { currentPassword: 'bad', newPassword: 'NewPass123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates password and revokes all OTHER sessions and refresh tokens', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', password: 'old-hash' } as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);
      (hashPassword as jest.Mock).mockResolvedValue('new-hash');
      m.prisma.session.updateMany.mockResolvedValue({ count: 2 } as never);
      m.prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 } as never);
      m.prisma.notification.create.mockResolvedValue({} as never);
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.changePassword('user-1', 'sess-current', {
        currentPassword: 'OldPass123',
        newPassword: 'NewPass123',
      });

      expect(result.message).toContain('changed');
      expect(m.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ password: 'new-hash' }) }),
      );
      // current session excluded from the revocation
      const updateManyCall = m.prisma.session.updateMany.mock.calls[0][0];
      expect(updateManyCall.data).toEqual(expect.objectContaining({ revokedAt: expect.any(Date) }));
      expect(updateManyCall.where.NOT.id).toBe('sess-current');
      expect(m.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'PASSWORD_CHANGED' }) }),
      );
    });
  });

  describe('enableTwoFactor', () => {
    it('throws ConflictException when already enabled', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', twoFactorEnabled: true } as never);

      await expect(service.enableTwoFactor('user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('generates a TOTP secret, stores it ENCRYPTED and returns the QR as pending', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.io', twoFactorEnabled: false } as never);
      m.prisma.user.update.mockResolvedValue({} as never);

      const result = await service.enableTwoFactor('user-1');

      expect(result.secret).toBeTruthy();
      expect(result.otpauthUrl).toContain('otpauth://');
      expect(result.qrCodeUrl).toContain('data:image/png;base64');
      expect(result.pending).toBe(true);

      const userUpdate = m.prisma.user.update.mock.calls[0][0];
      const storedSecret = userUpdate.data.twoFactorSecret;
      expect(storedSecret).not.toBe(result.secret); // encrypted, never plaintext
      expect(storedSecret.split('.').length).toBe(3);
      expect(userUpdate.data.twoFactorEnabled).toBe(false);
      // activation not complete yet → no audit
      expect(m.prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid TOTP code during step 1', async () => {
      (verifyTotp as jest.Mock).mockResolvedValueOnce({ valid: false });
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.io', twoFactorEnabled: false } as never);

      await expect(service.enableTwoFactor('user-1', { code: '000000' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.prisma.user.update).not.toHaveBeenCalled();
    });

    it('completes activation with a valid TOTP code after the QR step', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.io',
        twoFactorEnabled: false,
        twoFactorSecret: encryptSecret('JBSWY3DPEHPK3PXP', ENCRYPTION_KEY),
      } as never);
      m.prisma.user.update.mockResolvedValue({} as never);
      m.prisma.notification.create.mockResolvedValue({} as never);
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.enableTwoFactor('user-1', { code: '123456' });

      expect(result.message).toContain('enabled');
      expect(result.pending).toBeUndefined();
      expect(m.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ twoFactorEnabled: true }) }),
      );
      expect(m.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'TWO_FACTOR_ENABLED' }) }),
      );
    });

    it('requires a TOTP code to finalize activation when a secret is stored', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.io',
        twoFactorEnabled: false,
        twoFactorSecret: encryptSecret('JBSWY3DPEHPK3PXP', ENCRYPTION_KEY),
      } as never);

      await expect(service.enableTwoFactor('user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(m.prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('disableTwoFactor', () => {
    it('rejects when 2FA is not enabled', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', twoFactorEnabled: false } as never);

      await expect(service.disableTwoFactor('user-1', { code: '123456' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an invalid TOTP code and keeps 2FA enabled', async () => {
      (verifyTotp as jest.Mock).mockResolvedValueOnce({ valid: false });
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorSecret: encryptSecret('JBSWY3DPEHPK3PXP', ENCRYPTION_KEY),
      } as never);

      await expect(service.disableTwoFactor('user-1', { code: '000000' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.prisma.user.update).not.toHaveBeenCalled();
    });

    it('clears secret and flag on a valid code', async () => {
      m.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorSecret: encryptSecret('JBSWY3DPEHPK3PXP', ENCRYPTION_KEY),
      } as never);

      const result = await service.disableTwoFactor('user-1', { code: '123456' });

      expect(result.message).toContain('disabled');
      expect(m.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ twoFactorSecret: null, twoFactorEnabled: false }),
        }),
      );
    });
  });

  describe('requestEmailVerification', () => {
    it('rejects when the user is missing', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.requestEmailVerification('user-1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(emailVerification.requestCode).not.toHaveBeenCalled();
    });

    it('sends an email code and audits', async () => {
      const email = 'patient@example.com';
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email } as never);
      emailVerification.requestCode.mockResolvedValue('123456');
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.requestEmailVerification('user-1', {});

      expect(emailVerification.requestCode).toHaveBeenCalledWith('user-1', email);
      expect(result.devCode).toBe('123456'); // dev convenience
      expect(m.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'EMAIL_VERIFICATION_CODE_REQUESTED' }) }),
      );
    });
  });

  describe('confirmEmailVerification', () => {
    it('rejects an invalid code', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' } as never);
      emailVerification.verifyCode.mockResolvedValue(false);

      await expect(service.confirmEmailVerification('user-1', { code: '000000' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.prisma.user.update).not.toHaveBeenCalled();
    });

    it('marks emailVerifiedAt and audits on success', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' } as never);
      emailVerification.verifyCode.mockResolvedValue(true);
      m.prisma.user.update.mockResolvedValue({} as never);
      m.prisma.notification.create.mockResolvedValue({} as never);
      m.prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.confirmEmailVerification('user-1', { code: '123456' });

      expect(result.message).toContain('verified');
      expect(m.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }) }),
      );
      expect(m.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'EMAIL_VERIFIED' }) }),
      );
    });
  });
});