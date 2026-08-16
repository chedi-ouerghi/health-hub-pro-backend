import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UserRole, UserStatus } from '@prisma/client';

// ── Specialties ───────────────────────────────────────────────────────────────

export class CreateSpecialtyDto {
  @ApiProperty({ example: 'Cardiologie' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Diagnostic et traitement des maladies du cœur' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSpecialtyDto {
  @ApiPropertyOptional({ example: 'Cardiologie interventionnelle' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '…' })
  @IsOptional()
  @IsString()
  description?: string;
}

// ── Languages ─────────────────────────────────────────────────────────────────

export class CreateLanguageDto {
  @ApiProperty({ example: 'Français' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'fr', description: 'Code ISO 639-1 (lowercase, 2 letters)' })
  @IsString()
  code: string;
}

export class UpdateLanguageDto {
  @ApiPropertyOptional({ example: 'French' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  code?: string;
}

// ── Focus areas ───────────────────────────────────────────────────────────────

export class CreateFocusAreaDto {
  @ApiProperty({ example: 'Médecine du sport' })
  @IsString()
  name: string;
}

export class UpdateFocusAreaDto {
  @ApiPropertyOptional({ example: 'Médecine du sport et de l' + 'effort' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class FilterAdminUsersDto {
  @ApiPropertyOptional({ enum: UserRole, description: 'Filter by role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'alice', description: 'Free-text search on email / first name / last name' })
  @IsOptional()
  @IsString()
  q?: string;

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

export class UpdateUserStatusDto {
  @ApiProperty({ enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED] })
  @IsEnum([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED] as const)
  status: UserStatus;
}

export class FilterAuditLogsDto {
  @ApiPropertyOptional({ example: 'cm123user456', description: 'Filter by acting user' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: 'APPOINTMENT_CREATED', description: 'Filter by action code' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'Appointment', description: 'Filter by entity type' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Start date (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'End date (inclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

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

export class FilterLoginAttemptsDto {
  @ApiPropertyOptional({ example: 'alice@medicare.io' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '203.0.113.5' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ example: true, description: 'Filter success / failure' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

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

export class FilterSessionsDto {
  @ApiPropertyOptional({ example: 'cm123user456', description: 'Filter by user' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: true, description: 'Only show active (non-revoked, non-expired) sessions' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyActive?: boolean = true;

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