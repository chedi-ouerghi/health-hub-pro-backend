import { IsInt, IsOptional, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVitalRecordDto {
  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @IsInt()
  heartRate?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  systolic?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsInt()
  diastolic?: number;

  @ApiPropertyOptional({ example: 7.5 })
  @IsOptional()
  @IsNumber()
  sleepHours?: number;

  @ApiPropertyOptional({ example: 8500 })
  @IsOptional()
  @IsInt()
  steps?: number;
}
