import { IsString, IsOptional, IsEnum, IsDateString, IsPhoneNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, BloodType } from '@prisma/client';

export class UpdatePatientProfileDto {
  @ApiPropertyOptional({ example: 'Alice' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Martin' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: BloodType })
  @IsOptional()
  @IsEnum(BloodType)
  bloodType?: BloodType;

  @ApiPropertyOptional({ example: '12 rue de la Paix' })
  @IsOptional()
  @IsString()
  addressLine?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'France' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Jean Martin' })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @ApiPropertyOptional({ example: '+33612345678' })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class UpdateDoctorProfileDto {
  @ApiPropertyOptional({ example: 'Marie' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Dupont' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Cardiologue spécialisé en maladies coronariennes...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: '150.00' })
  @IsOptional()
  @IsString()
  consultationPrice?: string;

  @ApiPropertyOptional({ example: 'Clinique du Coeur' })
  @IsOptional()
  @IsString()
  clinicName?: string;

  @ApiPropertyOptional({ example: '5 Av. de la République' })
  @IsOptional()
  @IsString()
  addressLine?: string;

  @ApiPropertyOptional({ example: 'Lyon' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'France' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isAcceptingNewPatients?: boolean;

  @ApiPropertyOptional({ example: 'https://storage.example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
