import {
  IsString,
  IsOptional, IsEnum,
  IsInt,
  Min,
  Max,
  IsISO8601
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AppointmentStatus } from '@prisma/client';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'cm123abc456', description: 'Doctor ID' })
  @IsString()
  doctorId: string;

  @ApiProperty({ example: '2026-09-01T09:00:00.000Z', description: 'Appointment datetime (ISO 8601 UTC)' })
  @IsISO8601()
  scheduledAt: string;

  @ApiPropertyOptional({ example: 'Premier rendez-vous, douleurs thoraciques' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: '4242424242424242', description: 'Card number for static payment (dev only)' })
  @IsString()
  cardNumber: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Type(() => Number)
  expMonth: number;

  @ApiProperty({ example: 2030 })
  @IsInt()
  @Type(() => Number)
  expYear: number;

  @ApiProperty({ example: '123' })
  @IsString()
  cvc: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  cardHolderName?: string;
}

export class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW, AppointmentStatus.RESCHEDULED] })
  @IsEnum(AppointmentStatus)
  status: AppointmentStatus;

  @ApiPropertyOptional({ example: 'Patient did not show up' })
  @IsOptional()
  @IsString()
  cancelReason?: string;
}

export class FilterAppointmentsDto {
  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

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
