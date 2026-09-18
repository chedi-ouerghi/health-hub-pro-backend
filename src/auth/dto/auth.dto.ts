import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

// ── Register ──────────────────────────────────────────────────────────────────

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!2026' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Alice' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Martin' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: ['PATIENT', 'DOCTOR'] })
  @IsEnum(UserRole)
  role: UserRole;

  // Doctor-only fields
  @ApiPropertyOptional({ example: 'FR-MED-12345' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({ example: 'cm123abc456' })
  @IsOptional()
  @IsString()
  specialtyId?: string;

  @ApiPropertyOptional({ example: 'Clinique du Parc' })
  @IsOptional()
  @IsString()
  clinicName?: string;

  @ApiPropertyOptional({ example: '12 Rue de la Santé' })
  @IsOptional()
  @IsString()
  addressLine?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'France' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '100.00' })
  @IsOptional()
  @IsString()
  consultationPrice?: string;

  /** Cloudflare Turnstile token (required in production, optional in dev) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cfTurnstileToken?: string;
}

// ── Login ─────────────────────────────────────────────────────────────────────

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!2026' })
  @IsString()
  password: string;
}

// ── Refresh token ─────────────────────────────────────────────────────────────

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Optional — when omitted, the httpOnly refresh_token cookie is used',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

// ── Verify email ──────────────────────────────────────────────────────────────

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  token: string;
}

// ── Resend verification email ─────────────────────────────────────────────────

export class ResendVerificationDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;
}

// ── Forgot password ───────────────────────────────────────────────────────────

export class ForgotPasswordDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;
}

// ── Reset password ────────────────────────────────────────────────────────────

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewP@ssw0rd!2026' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

// ── Logout ────────────────────────────────────────────────────────────────────

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
