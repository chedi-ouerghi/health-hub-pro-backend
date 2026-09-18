import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeviceType, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashPassword, hashToken, verifyPassword } from '../common/utils/hash.utils';
import { MailService } from '../common/services/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // ── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    if (dto.role === UserRole.DOCTOR) {
      if (!dto.licenseNumber || !dto.specialtyId || !dto.clinicName || !dto.addressLine || !dto.city || !dto.country) {
        throw new BadRequestException('Doctors must provide licenseNumber, specialtyId, clinicName, addressLine, city and country');
      }
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          password: passwordHash,
          role: dto.role,
          status: 'PENDING_VERIFICATION',
        },
      });

      if (dto.role === UserRole.PATIENT) {
        await tx.patient.create({
          data: {
            userId: newUser.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
      } else if (dto.role === UserRole.DOCTOR) {
        const specialty = await tx.specialty.findUnique({ where: { id: dto.specialtyId! } });
        if (!specialty) throw new BadRequestException('Specialty not found');

        await tx.doctor.create({
          data: {
            userId: newUser.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
            licenseNumber: dto.licenseNumber!,
            specialtyId: dto.specialtyId!,
            clinicName: dto.clinicName!,
            addressLine: dto.addressLine!,
            city: dto.city!,
            country: dto.country!,
            consultationPrice: dto.consultationPrice ? parseFloat(dto.consultationPrice) : 0,
          },
        });
      }

      // Create email verification token
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      await tx.emailVerificationToken.create({
        data: {
          userId: newUser.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: 'USER_REGISTERED',
          entityType: 'User',
          entityId: newUser.id,
          metadata: { role: dto.role, email: dto.email },
        },
      });

      return { user: newUser, verificationToken: rawToken };
    });

    // Best-effort email delivery (never fails the registration).
    await this.mail.sendVerificationEmail(user.user.email, user.verificationToken, {
      firstName: dto.firstName,
    });

    return {
      message: 'Registration successful. Please verify your email.',
      userId: user.user.id,
      // In production, verificationToken is delivered by email; returned here for dev convenience
      ...(this.config.get('NODE_ENV') !== 'production' && { verificationToken: user.verificationToken }),
    };
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    // Record attempt before checking anything (timing-safe)
    const recordAttempt = async (success: boolean) => {
      if (user) {
        await this.prisma.loginAttempt.create({
          data: {
            userId: user.id,
            email: dto.email,
            ipAddress: ip,
            userAgent,
            success,
          },
        });
      } else {
        await this.prisma.loginAttempt.create({
          data: { email: dto.email, ipAddress: ip, userAgent, success: false },
        });
      }
    };

    if (!user) {
      await recordAttempt(false);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordAttempt(false);
      throw new ForbiddenException(`Account locked until ${user.lockedUntil.toISOString()}`);
    }

    const valid = await verifyPassword(dto.password, user.password);

    if (!valid) {
      await recordAttempt(false);
      const newCount = user.failedLoginCount + 1;
      const lockData =
        newCount >= MAX_FAILED_LOGINS
          ? { lockedUntil: new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000), failedLoginCount: 0 }
          : { failedLoginCount: newCount };
      await this.prisma.user.update({ where: { id: user.id }, data: lockData });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');
    if (user.status === 'DEACTIVATED') throw new ForbiddenException('Account deactivated');

    // Reset failed count
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });

    await recordAttempt(true);

    // Track an active session (device) bound to the refresh token lifecycle
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const refreshMs = this._parseDuration(refreshExpiresIn);
    let sessionId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: user.id },
        data: { isCurrent: false },
      });
      // Placeholder fingerprint — replaced by the real refresh-token hash below
      const sessionRecord = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(randomBytes(32).toString('hex')),
          deviceName: AuthService._detectDeviceName(userAgent),
          deviceType: AuthService._detectDeviceType(userAgent),
          ipAddress: ip,
          userAgent,
          isCurrent: true,
          lastActiveAt: new Date(),
          expiresAt: new Date(Date.now() + refreshMs),
        },
      });
      sessionId = sessionRecord?.id;
    });

    // Session must exist BEFORE issuing tokens so the JWT carries the sessionId
    const tokens = await this._issueTokens(user.id, user.email, user.role, ip, sessionId);

    // Bind the session to the actual refresh-token fingerprint
    if (sessionId) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { tokenHash: hashToken(tokens.refreshToken) },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGGED_IN',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ip,
      },
    });

    return tokens;
  }

  // ── Refresh token ────────────────────────────────────────────────────────────

  async refresh(dto: RefreshTokenDto) {
    if (!dto.refreshToken) throw new UnauthorizedException('Missing refresh token');

    const tokenHash = hashToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // Keep the bound device session alive across rotations: rebind its
    // fingerprint to the new refresh token and refresh its activity marker.
    let sessionId: string | undefined;
    const boundSession = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (boundSession) {
      sessionId = boundSession.id;
      await this.prisma.session.update({
        where: { id: boundSession.id },
        data: { isCurrent: true, lastActiveAt: new Date() },
      });
    }

    const tokens = await this._issueTokens(stored.userId, stored.user.email, stored.user.role, undefined, sessionId);

    if (boundSession) {
      await this.prisma.session.update({
        where: { id: boundSession.id },
        data: { tokenHash: hashToken(tokens.refreshToken) },
      });
    }

    return tokens;
  }

  // ── Logout ───────────────────────────────────────────────────────────────────

  async logout(userId: string, rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Revoke the matching device session
      await this.prisma.session.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all active refresh tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Revoke all active sessions for this user
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_LOGGED_OUT',
        entityType: 'User',
        entityId: userId,
      },
    });

    return { message: 'Logged out successfully' };
  }

  // ── Verify email ─────────────────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = hashToken(dto.token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
      }),
    ]);

    return { message: 'Email verified successfully' };
  }

  // ── Resend verification email ────────────────────────────────────────────────

  async resendVerificationEmail(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
      include: { patient: true, doctor: true },
    });

    // Always return the same response to avoid user enumeration.
    if (user && !user.emailVerifiedAt) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);

      // Invalidate any previous unused tokens so they cannot be replayed.
      await this.prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        },
      });

      const firstName = user.patient?.firstName ?? user.doctor?.firstName;
      await this.mail.sendVerificationEmail(user.email, rawToken, { firstName });
    }

    return { message: 'If this email exists, a verification link has been sent.' };
  }

  // ── Forgot password ──────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    // Always return same response to avoid user enumeration
    if (!user) return { message: 'If this email exists, a reset link has been sent.' };

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
      },
    });

    // Best-effort email delivery (never leaks whether the account exists).
    await this.mail.sendPasswordResetEmail(user.email, rawToken);

    // In production, the reset link is delivered by email. Dev: return token.
    return {
      message: 'If this email exists, a reset link has been sent.',
      ...(this.config.get('NODE_ENV') !== 'production' && { resetToken: rawToken }),
    };
  }

  // ── Reset password ────────────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      // Revoke all refresh tokens for security
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        userId: record.userId,
        action: 'PASSWORD_RESET',
        entityType: 'User',
        entityId: record.userId,
      },
    });

    return { message: 'Password reset successfully' };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /** Basic device name extraction from a User-Agent string (fallback "Unknown device"). */
  private static _detectDeviceName(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;
    const match = userAgent.match(/^([^/\s]+)[/ ]([^\s]+)/);
    return match ? `${match[1]} ${match[2]}`.slice(0, 64) : userAgent.split(' ')[0]?.slice(0, 64);
  }

  /** Basic device type detection from a User-Agent string. */
  private static _detectDeviceType(userAgent?: string): DeviceType {
    const ua = userAgent?.toLowerCase() ?? '';
    if (/ipad|tablet|playbook|silk/.test(ua)) return DeviceType.TABLET;
    if (/mobi|android|iphone|ipod|blackberry|windows phone/.test(ua)) return DeviceType.MOBILE;
    return DeviceType.DESKTOP;
  }

  private async _issueTokens(userId: string, email: string, role: string, ip?: string, sessionId?: string) {
    const payload = { sub: userId, email, role, ...(sessionId ? { sessionId } : {}) };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '15m') as any,
    });

    const rawRefresh = randomBytes(40).toString('hex');
    const refreshHash = hashToken(rawRefresh);

    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const refreshMs = this._parseDuration(refreshExpiresIn);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshHash,
        createdByIp: ip,
        expiresAt: new Date(Date.now() + refreshMs),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
    };
  }

  private _parseDuration(d: string): number {
    const match = d.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const [, num, unit] = match;
    const n = parseInt(num, 10);
    switch (unit) {
      case 's': return n * 1000;
      case 'm': return n * 60 * 1000;
      case 'h': return n * 60 * 60 * 1000;
      case 'd': return n * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
