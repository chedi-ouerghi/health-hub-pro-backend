import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '@prisma/client';

export class FilterInvoicesDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

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

export class CreateInvoiceDto {
  @ApiProperty({ example: 'cm123appt456', description: 'Appointment ID the invoice is linked to' })
  @IsString()
  appointmentId: string;

  @ApiPropertyOptional({
    description: 'Payment method (defaults to nothing / pending payment)',
    example: 'card',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}