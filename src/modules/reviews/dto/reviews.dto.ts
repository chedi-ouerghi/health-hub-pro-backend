import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ example: 'cm123appointment456', description: 'Appointment ID (must be COMPLETED)' })
  @IsString()
  appointmentId: string;

  @ApiProperty({ example: 5, description: 'Rating from 1 to 5' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Excellent médecin, très à l’écoute !' })
  @IsOptional()
  @IsString()
  comment?: string;
}
