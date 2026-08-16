import { IsOptional, IsString, IsBoolean, IsEnum, IsInt, Min, Max, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

// ── Education ──────────────────────────────────────────────────────────────────

export class CreateEducationDto {
  @ApiProperty({ example: 'Université de Paris' })
  @IsString()
  school: string;

  @ApiProperty({ example: 'Doctorat en Médecine' })
  @IsString()
  degree: string;

  @ApiProperty({ example: 2010 })
  @Type(() => Number)
  @IsInt()
  startYear: number;

  @ApiPropertyOptional({ example: 2016 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  endYear?: number;
}

export class UpdateEducationDto {
  @ApiPropertyOptional({ example: 'Université de Lyon' })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiPropertyOptional({ example: 'Diplôme de spécialisation' })
  @IsOptional()
  @IsString()
  degree?: string;

  @ApiPropertyOptional({ example: 2015 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  startYear?: number;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  endYear?: number;
}

// ── Certificates ───────────────────────────────────────────────────────────────

export class CreateCertificateDto {
  @ApiProperty({ example: 'Board Certification in Cardiology' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'American Board of Medical Specialties' })
  @IsOptional()
  @IsString()
  issuedBy?: string;

  @ApiPropertyOptional({ example: '2020-06-15' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;
}

export class UpdateCertificateDto {
  @ApiPropertyOptional({ example: 'Board Certification in Interventional Cardiology' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'American Board of Medical Specialties' })
  @IsOptional()
  @IsString()
  issuedBy?: string;

  @ApiPropertyOptional({ example: '2021-01-10' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;
}

// ── Focus areas & languages (join tables) ─────────────────────────────────────

export class AddFocusAreaDto {
  @ApiProperty({ example: 'cm123abc456', description: 'FocusArea ID from GET /focus-areas' })
  @IsString()
  focusAreaId: string;
}

export class AddLanguageDto {
  @ApiProperty({ example: 'cm456abc789', description: 'Language ID from GET /languages' })
  @IsString()
  languageId: string;
}

// ── Advanced search ────────────────────────────────────────────────────────────

export class SearchDoctorsDto {
  @ApiPropertyOptional({ example: 'Dr. Martin' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 'Cardiology', description: 'Specialty name, slug or ID' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'fr', description: 'Language name or ISO 639-1 code' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @ApiPropertyOptional({ example: 'rating', enum: ['rating', 'experience', 'price', 'name'] })
  @IsOptional()
  @IsString()
  sort?: 'rating' | 'experience' | 'price' | 'name' = 'rating';

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

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
