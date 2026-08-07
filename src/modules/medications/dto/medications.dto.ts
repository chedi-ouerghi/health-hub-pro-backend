import { IsString, IsBoolean, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicationLogStatus } from '@prisma/client';

export class CreateMedicationDto {
  @ApiProperty({ example: 'Doliprane' })
  @IsString()
  name: string;

  @ApiProperty({ example: '1000mg' })
  @IsString()
  dose: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  scheduledTime: string;
}

export class UpdateMedicationDto {
  @ApiPropertyOptional({ example: 'Doliprane' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '1000mg' })
  @IsOptional()
  @IsString()
  dose?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  scheduledTime?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMedicationLogDto {
  @ApiProperty({ enum: MedicationLogStatus })
  @IsEnum(MedicationLogStatus)
  status: MedicationLogStatus;
}
