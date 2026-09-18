import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/services/mail.service';
import { createPrismaMock, PrismaMock } from '../test/prisma-mock';
import { UserRole } from '@prisma/client';
import { hashPassword, verifyPassword } from '../common/utils/hash.utils';

jest.mock('../common/utils/hash.utils', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
  hashToken: jest.fn((t: string) => `hashed-${t}`),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: PrismaMock;
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };

  const user = {
    id: 'user-1',
    email: 'john@medicare.io',
    password: 'argon-hash',
    role: UserRole.PATIENT,
    status: 'ACTIVE',
    failedLoginCount: 0,
    lockedUntil: null,
  };

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    jwt = { sign: jest.fn().mockReturnValue('jwt-access-token') };
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, unknown> = {
          NODE_ENV: 'test',
          JWT_SECRET: 'secret',
          JWT_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return map[key];
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock.prisma as unknown as PrismaService },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        {
          provide: MailService,
          useValue: {
            isConfigured: false,
            sendVerificationEmail: jest.fn().mockResolvedValue(false),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('throws ConflictException when email already registered', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(user as never);

      await expect(
        service.register({ email: 'john@medicare.io', password: 'x', firstName: 'J', lastName: 'D', role: UserRole.PATIENT }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects DOCTOR registration without required fields', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(null as never);

      await expect(
        service.register({
          email: 'doc@medicare.io',
          password: 'x',
          firstName: 'A',
          lastName: 'B',
          role: UserRole.DOCTOR,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates patient + verification token + audit log for PATIENT', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(null as never);
      (hashPassword as jest.Mock).mockResolvedValue('hashed-pw');

      const newUser = { id: 'user-2', email: 'a@b.io', role: UserRole.PATIENT };
      prismaMock.tx.user.create.mockResolvedValue(newUser as never);
      prismaMock.tx.patient.create.mockResolvedValue({ id: 'pat-1' } as never);
      prismaMock.tx.emailVerificationToken.create.mockResolvedValue({} as never);
      prismaMock.tx.auditLog.create.mockResolvedValue({} as never);

      const result = await service.register({
        email: 'a@b.io',
        password: 'pw',
        firstName: 'A',
        lastName: 'B',
        role: UserRole.PATIENT,
      });

      expect(result.userId).toBe('user-2');
      expect(result.verificationToken).toBeDefined();
      expect(prismaMock.tx.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ firstName: 'A', lastName: 'B' }) }),
      );
    });

    it('creates doctor profile for DOCTOR with valid specialty', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(null as never);
      (hashPassword as jest.Mock).mockResolvedValue('hashed-pw');
      prismaMock.tx.user.create.mockResolvedValue({ id: 'user-3' } as never);
      prismaMock.tx.specialty.findUnique.mockResolvedValue({ id: 'spec-1' } as never);
      prismaMock.tx.doctor.create.mockResolvedValue({ id: 'doc-1' } as never);
      prismaMock.tx.emailVerificationToken.create.mockResolvedValue({} as never);
      prismaMock.tx.auditLog.create.mockResolvedValue({} as never);

      const result = await service.register({
        email: 'doc@medicare.io',
        password: 'pw',
        firstName: 'A',
        lastName: 'B',
        role: UserRole.DOCTOR,
        licenseNumber: 'LIC-1',
        specialtyId: 'spec-1',
        clinicName: 'Clinic',
        addressLine: '1 st',
        city: 'Paris',
        country: 'FR',
        consultationPrice: '150.00',
      });

      expect(result.userId).toBe('user-3');
      expect(prismaMock.tx.doctor.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ consultationPrice: 150 }) }),
      );
    });

    it('rejects DOCTOR registration with unknown specialty', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(null as never);
      (hashPassword as jest.Mock).mockResolvedValue('hashed-pw');
      prismaMock.tx.user.create.mockResolvedValue({ id: 'user-4' } as never);
      prismaMock.tx.specialty.findUnique.mockResolvedValue(null as never);

      await expect(
        service.register({
          email: 'doc@medicare.io',
          password: 'pw',
          firstName: 'A',
          lastName: 'B',
          role: UserRole.DOCTOR,
          licenseNumber: 'LIC-1',
          specialtyId: 'spec-x',
          clinicName: 'Clinic',
          addressLine: '1 st',
          city: 'Paris',
          country: 'FR',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('login', () => {
    it('rejects unknown email', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(null as never);
      prismaMock.prisma.loginAttempt.create.mockResolvedValue({} as never);

      await expect(service.login({ email: 'nobody@x.io', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prismaMock.prisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ success: false }) }),
      );
    });

    it('rejects login on locked account', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue({
        ...user,
        lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
      } as never);
      prismaMock.prisma.loginAttempt.create.mockResolvedValue({} as never);

      await expect(service.login({ email: user.email, password: 'x' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects wrong password and increments failed count', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(user as never);
      (verifyPassword as jest.Mock).mockResolvedValue(false);
      prismaMock.prisma.loginAttempt.create.mockResolvedValue({} as never);
      prismaMock.prisma.user.update.mockResolvedValue({} as never);

      await expect(service.login({ email: user.email, password: 'bad' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prismaMock.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 1 }) }),
      );
    });

    it('rejects suspended account', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue({ ...user, status: 'SUSPENDED' } as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);
      prismaMock.prisma.loginAttempt.create.mockResolvedValue({} as never);

      await expect(service.login({ email: user.email, password: 'ok' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns tokens on successful login', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(user as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);
      prismaMock.prisma.user.update.mockResolvedValue({} as never);
      prismaMock.prisma.loginAttempt.create.mockResolvedValue({} as never);
      prismaMock.prisma.refreshToken.create.mockResolvedValue({} as never);
      prismaMock.prisma.auditLog.create.mockResolvedValue({} as never);

      const tokens = await service.login({ email: user.email, password: 'ok' }, '1.2.3.4', 'jest');

      expect(tokens.accessToken).toBe('jwt-access-token');
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe('15m');
      expect(prismaMock.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 0, lastLoginAt: expect.any(Date) }) }),
      );
    });

    it('tracks an active device session on successful login', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(user as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);
      prismaMock.prisma.user.update.mockResolvedValue({} as never);
      prismaMock.prisma.loginAttempt.create.mockResolvedValue({} as never);
      prismaMock.prisma.refreshToken.create.mockResolvedValue({} as never);
      prismaMock.prisma.session.create.mockResolvedValue({} as never);
      prismaMock.prisma.session.updateMany.mockResolvedValue({ count: 1 } as never);

      await service.login({ email: user.email, password: 'ok' }, '1.2.3.4', 'Mozilla/5.0 (iPhone)');

      expect(prismaMock.tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' }, data: { isCurrent: false } }),
      );
      expect(prismaMock.tx.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            tokenHash: expect.stringContaining('hashed-'),
            isCurrent: true,
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('refresh', () => {
    it('rejects invalid or expired refresh token', async () => {
      prismaMock.prisma.refreshToken.findUnique.mockResolvedValue(null as never);

      await expect(service.refresh({ refreshToken: 'nope' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rotates and issues new tokens', async () => {
      prismaMock.prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        user,
      } as never);
      prismaMock.prisma.refreshToken.update.mockResolvedValue({} as never);
      prismaMock.prisma.refreshToken.create.mockResolvedValue({} as never);

      const result = await service.refresh({ refreshToken: 'valid-token' });

      expect(prismaMock.prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      );
      expect(result.accessToken).toBe('jwt-access-token');
    });
  });

  describe('logout', () => {
    it('revokes a single refresh token when provided', async () => {
      prismaMock.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.prisma.session.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.prisma.auditLog.create.mockResolvedValue({} as never);

      await service.logout('user-1', 'raw-token');

      expect(prismaMock.prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tokenHash: 'hashed-raw-token' }) }),
      );
      expect(prismaMock.prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tokenHash: 'hashed-raw-token', revokedAt: null }) }),
      );
      expect(prismaMock.prisma.auditLog.create).toHaveBeenCalled();
    });

    it('revokes all tokens when no token provided', async () => {
      prismaMock.prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 } as never);
      prismaMock.prisma.session.updateMany.mockResolvedValue({ count: 2 } as never);
      prismaMock.prisma.auditLog.create.mockResolvedValue({} as never);

      await service.logout('user-1');

      expect(prismaMock.prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1', revokedAt: null }) }),
      );
      expect(prismaMock.prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1', revokedAt: null }) }),
      );
    });
  });

  describe('verifyEmail', () => {
    it('rejects invalid token', async () => {
      prismaMock.prisma.emailVerificationToken.findUnique.mockResolvedValue(null as never);

      await expect(service.verifyEmail({ token: 'bad' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('activates the user on success', async () => {
      prismaMock.prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'evt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      } as never);
      prismaMock.prisma.emailVerificationToken.update.mockResolvedValue({} as never);
      prismaMock.prisma.user.update.mockResolvedValue({} as never);

      const result = await service.verifyEmail({ token: 'ok' });

      expect(result.message).toContain('verified');
      expect(prismaMock.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
    });
  });

  describe('resendVerificationEmail', () => {
    it('returns generic message for unknown email', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(null as never);

      const result = await service.resendVerificationEmail({ email: 'nobody@x.io' });

      expect(result.message).toContain('If this email exists');
      expect(prismaMock.prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('creates a fresh token and sends the email for an unverified user', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'alice@x.io',
        emailVerifiedAt: null,
        patient: { firstName: 'Alice' },
        doctor: null,
      } as never);
      prismaMock.prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.prisma.emailVerificationToken.create.mockResolvedValue({ id: 'evt-2' } as never);

      const result = await service.resendVerificationEmail({ email: 'alice@x.io' });

      expect(result.message).toContain('If this email exists');
      expect(prismaMock.prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
      );
      expect(prismaMock.prisma.emailVerificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });
  });

  describe('forgotPassword', () => {
    it('returns generic message for unknown email', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(null as never);

      const result = await service.forgotPassword({ email: 'nobody@x.io' });
      expect(result.message).toContain('If this email exists');
      expect(prismaMock.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a reset token for existing user', async () => {
      prismaMock.prisma.user.findUnique.mockResolvedValue(user as never);
      prismaMock.prisma.passwordResetToken.create.mockResolvedValue({} as never);

      const result = await service.forgotPassword({ email: user.email });
      expect((result as { resetToken?: string }).resetToken).toBeDefined();
      expect(prismaMock.prisma.passwordResetToken.create).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rejects invalid token', async () => {
      prismaMock.prisma.passwordResetToken.findUnique.mockResolvedValue(null as never);

      await expect(service.resetPassword({ token: 'bad', newPassword: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('updates password, revokes tokens and audits on success', async () => {
      prismaMock.prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      } as never);
      (hashPassword as jest.Mock).mockResolvedValue('new-hash');
      prismaMock.prisma.passwordResetToken.update.mockResolvedValue({} as never);
      prismaMock.prisma.user.update.mockResolvedValue({} as never);
      prismaMock.prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resetPassword({ token: 'ok', newPassword: 'new-pw' });

      expect(result.message).toContain('reset');
      expect(prismaMock.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ password: 'new-hash' }) }),
      );
      expect(prismaMock.prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
