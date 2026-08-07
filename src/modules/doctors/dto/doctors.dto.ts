import { IsOptional, IsString, IsBoolean, IsEnum, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DayOfWeek } from '@prisma/client';

// ── List doctors filter ──────────────────────────────────────────────────────

export class FilterDoctorsDto {
  @ApiPropertyOptional({ example: 'cm123abc456' })
  @IsOptional()
  @IsString()
  specialtyId?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  availableToday?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isAcceptingNewPatients?: boolean;

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
  limit?: number = 20;
}

// ── Update availability ───────────────────────────────────────────────────────

export class CreateAvailabilityDto {
  @ApiPropertyOptional({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @ApiPropertyOptional({ example: '09:00' })
  @IsString()
  startTime: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsString()
  endTime: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  slotMinutes?: number = 30;
}

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  slotMinutes?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
