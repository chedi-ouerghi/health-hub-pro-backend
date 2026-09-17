import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

// ── Change password ───────────────────────────────────────────────────────────

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentP@ssw0rd!2026' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewP@ssw0rd!2026', description: 'Min 8 chars, must contain a letter and a digit' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, {
    message: 'newPassword must contain at least one letter and one digit',
  })
  newPassword: string;
}

// ── Two-factor authentication ─────────────────────────────────────────────────

export class EnableTwoFactorDto {
  @ApiPropertyOptional({ example: '123456', description: 'Optional TOTP code to confirm activation immediately' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit TOTP code' })
  code?: string;
}

export class DisableTwoFactorDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit TOTP code' })
  code: string;
}

// ── Email verification ────────────────────────────────────────────────────────

export class RequestEmailVerificationDto {
  @ApiPropertyOptional({ example: 'patient@example.com', description: 'Defaults to the email on the account' })
  @IsOptional()
  @IsString()
  email?: string;
}

export class ConfirmEmailVerificationDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit email verification code' })
  code: string;
}

// ── My sessions ───────────────────────────────────────────────────────────────

export class FilterMySessionsDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}