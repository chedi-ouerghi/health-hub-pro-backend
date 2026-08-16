import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../../common/services/sms.service';
import { UpdatePatientProfileDto, UpdateDoctorProfileDto } from './dto/update-profile.dto';
import {
  ChangePasswordDto,
  EnableTwoFactorDto,
  DisableTwoFactorDto,
  RequestPhoneVerificationDto,
  ConfirmPhoneVerificationDto,
  FilterMySessionsDto,
} from './dto/security.dto';
import { hashPassword, verifyPassword } from '../../common/utils/hash.utils';
import { encryptSecret, decryptSecret } from '../../common/utils/crypto.utils';
import { generateSecret, generateURI, verify } from 'otplib';
import * as qrcode from 'qrcode';
import { NotificationType } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  async getMe(userId: string, role: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            dateOfBirth: true,
            gender: true,
            bloodType: true,
            addressLine: true,
            city: true,
            country: true,
            membershipPlan: true,
            memberSince: true,
            emergencyContactName: true,
            emergencyContactRelation: true,
            emergencyContactPhone: true,
          },
        },
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            specialty: { select: { id: true, name: true, slug: true } },
            licenseNumber: true,
            isLicenseVerified: true,
            yearsOfExperience: true,
            bio: true,
            consultationPrice: true,
            currency: true,
            clinicName: true,
            addressLine: true,
            city: true,
            country: true,
            ratingAverage: true,
            reviewCount: true,
            patientCount: true,
            recommendationRate: true,
            isAcceptingNewPatients: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: string, role: string, dto: UpdatePatientProfileDto | UpdateDoctorProfileDto) {
    if (role === 'PATIENT') {
      const patch = dto as UpdatePatientProfileDto;
      const patient = await this.prisma.patient.update({
        where: { userId },
        data: {
          firstName: patch.firstName,
          lastName: patch.lastName,
          dateOfBirth: patch.dateOfBirth ? new Date(patch.dateOfBirth) : undefined,
          gender: patch.gender,
          bloodType: patch.bloodType,
          addressLine: patch.addressLine,
          city: patch.city,
          country: patch.country,
          emergencyContactName: patch.emergencyContactName,
          emergencyContactRelation: patch.emergencyContactRelation,
          emergencyContactPhone: patch.emergencyContactPhone,
          photoUrl: patch.photoUrl,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          gender: true,
          bloodType: true,
          city: true,
          country: true,
        },
      });
      return patient;
    }

    if (role === 'DOCTOR') {
      const patch = dto as UpdateDoctorProfileDto;
      const doctor = await this.prisma.doctor.update({
        where: { userId },
        data: {
          firstName: patch.firstName,
          lastName: patch.lastName,
          bio: patch.bio,
          consultationPrice: patch.consultationPrice ? parseFloat(patch.consultationPrice) : undefined,
          clinicName: patch.clinicName,
          addressLine: patch.addressLine,
          city: patch.city,
          country: patch.country,
          isAcceptingNewPatients: patch.isAcceptingNewPatients,
          photoUrl: patch.photoUrl,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          bio: true,
          consultationPrice: true,
          city: true,
          country: true,
          isAcceptingNewPatients: true,
        },
      });
      return doctor;
    }

    throw new ForbiddenException('Profile update not available for this role');
  }

  // ── My sessions ──────────────────────────────────────────────────────────────

  async getMySessions(userId: string, filter: FilterMySessionsDto) {
    const { page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;
    const where = { userId, revokedAt: null, expiresAt: { gt: new Date() } };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastActiveAt: 'desc' },
        select: {
          id: true,
          deviceName: true,
          deviceType: true,
          ipAddress: true,
          location: true,
          userAgent: true,
          isCurrent: true,
          lastActiveAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    return { sessions, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async revokeMySession(userId: string, sessionId: string, currentSessionId?: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
    if (session.revokedAt) throw new BadRequestException('Session is already revoked');
    if (currentSessionId && session.id === currentSessionId) {
      throw new BadRequestException('You cannot revoke the current session (use logout instead)');
    }

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), isCurrent: false },
      }),
      // Revoke the refresh token bound to this device session
      this.prisma.refreshToken.updateMany({
        where: { tokenHash: session.tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'SESSION_REVOKED',
          entityType: 'Session',
          entityId: sessionId,
          metadata: { revokedBy: 'USER' },
        },
      }),
    ]);

    return { message: 'Session revoked' };
  }

  // ── Change password ──────────────────────────────────────────────────────────

  async changePassword(userId: string, currentSessionId: string | undefined, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await verifyPassword(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      // Revoke every OTHER session (current device stays signed in)
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}) },
        data: { revokedAt: new Date(), isCurrent: false },
      }),
      // Revoke all refresh tokens → other devices must re-authenticate
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM,
          title: 'Mot de passe modifié',
          body: 'Votre mot de passe a été modifié. Les autres sessions ont été déconnectées.',
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGED',
          entityType: 'User',
          entityId: userId,
        },
      }),
    ]);

    return { message: 'Password changed. Other sessions have been revoked.' };
  }

  // ── Two-factor authentication ────────────────────────────────────────────────

  async enableTwoFactor(userId: string, dto?: EnableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) throw new ConflictException('Two-factor authentication is already enabled');

    // ── Step 2: a secret was already generated — complete activation with a valid TOTP
    if (user.twoFactorSecret) {
      let storedSecret: string;
      try {
        storedSecret = decryptSecret(user.twoFactorSecret, this._encryptionKey());
      } catch {
        throw new BadRequestException('Stored 2FA secret is unreadable — restart the setup');
      }
      if (!dto?.code) {
        throw new BadRequestException('A TOTP code is required to finish activation');
      }
      if (!(await verify({ token: dto.code, secret: storedSecret })).valid) {
        throw new BadRequestException('Invalid verification code');
      }

      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } }),
        this.prisma.notification.create({
          data: {
            userId,
            type: NotificationType.SYSTEM,
            title: 'Authentification à deux facteurs activée',
            body: 'La 2FA est maintenant active sur votre compte.',
          },
        }),
        this.prisma.auditLog.create({
          data: {
            userId,
            action: 'TWO_FACTOR_ENABLED',
            entityType: 'User',
            entityId: userId,
          },
        }),
      ]);

      return { message: 'Two-factor authentication enabled' };
    }

    // ── Step 1: generate a fresh secret, store it encrypted, return QR + otpauth
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'Health Hub Pro', label: user.email, secret });

    // Optional immediate confirmation: the secret is only enabled after a valid TOTP
    if (dto?.code && !(await verify({ token: dto.code, secret })).valid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptSecret(secret, this._encryptionKey()), twoFactorEnabled: Boolean(dto?.code) },
    });

    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

    return {
      message: dto?.code
        ? 'Two-factor authentication enabled'
        : 'Scan the QR code with your authenticator app, then confirm with a TOTP code',
      secret,
      otpauthUrl,
      qrCodeUrl,
      pending: !dto?.code,
    };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    let secret: string;
    try {
      secret = decryptSecret(user.twoFactorSecret, this._encryptionKey());
    } catch {
      throw new BadRequestException('Unable to verify the TOTP secret');
    }

    if (!(await verify({ token: dto.code, secret })).valid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: null, twoFactorEnabled: false },
      }),
      this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM,
          title: 'Authentification à deux facteurs désactivée',
          body: 'La 2FA a été désactivée sur votre compte.',
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'TWO_FACTOR_DISABLED',
          entityType: 'User',
          entityId: userId,
        },
      }),
    ]);

    return { message: 'Two-factor authentication disabled' };
  }

  // ── Phone verification ───────────────────────────────────────────────────────

  async requestPhoneVerification(userId: string, dto: RequestPhoneVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const phone = (dto.phone ?? user.phone)?.trim();
    if (!phone) throw new BadRequestException('A phone number is required to verify it');

    if (dto.phone && dto.phone !== user.phone) {
      try {
        await this.prisma.user.update({ where: { id: userId }, data: { phone } });
      } catch (err: any) {
        if (err?.code === 'P2002') throw new ConflictException('Phone number already in use');
        throw err;
      }
    }

    const code = await this.sms.requestCode(userId, phone);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'PHONE_VERIFICATION_REQUESTED',
        entityType: 'User',
        entityId: userId,
        metadata: { phone },
      },
    });

    return {
      message: 'Verification code sent',
      // In production, the code is sent by SMS only; dev convenience mirrors verificationToken
      ...(this.config.get('NODE_ENV') !== 'production' && { devCode: code }),
    };
  }

  async confirmPhoneVerification(userId: string, dto: ConfirmPhoneVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!this.sms.verifyCode(userId, dto.code)) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } }),
      this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SYSTEM,
          title: 'Téléphone vérifié',
          body: 'Votre numéro de téléphone a été vérifié avec succès.',
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'PHONE_VERIFIED',
          entityType: 'User',
          entityId: userId,
        },
      }),
    ]);

    return { message: 'Phone number verified' };
  }

  private _encryptionKey(): string {
    return this.config.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ?? this.config.get<string>('JWT_SECRET') ?? 'health-hub-pro';
  }
}