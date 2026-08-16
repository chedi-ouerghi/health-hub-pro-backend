import { IsString, IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActivityType } from '@prisma/client';

export class CreateActivityLogDto {
  @ApiProperty({ enum: ActivityType, description: 'Type of activity (internal/system or treating doctor)' })
  @IsEnum(ActivityType)
  type: ActivityType;

  @ApiProperty({ example: 'Ordonnance renouvelée' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Pénicilline 500mg, 2x/jour' })
  @IsOptional()
  @IsString()
  meta?: string;
}

export class FilterActivityLogsDto {
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