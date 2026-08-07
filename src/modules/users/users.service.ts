import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePatientProfileDto, UpdateDoctorProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string, role: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            dateOfBirth: true,
            gender: true,
            bloodType: true,
            addressLine: true,
            city: true,
            country: true,
            membershipPlan: true,
            memberSince: true,
            emergencyContactName: true,
            emergencyContactRelation: true,
            emergencyContactPhone: true,
          },
        },
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            specialty: { select: { id: true, name: true, slug: true } },
            licenseNumber: true,
            isLicenseVerified: true,
            yearsOfExperience: true,
            bio: true,
            consultationPrice: true,
            currency: true,
            clinicName: true,
            addressLine: true,
            city: true,
            country: true,
            ratingAverage: true,
            reviewCount: true,
            patientCount: true,
            recommendationRate: true,
            isAcceptingNewPatients: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: string, role: string, dto: UpdatePatientProfileDto | UpdateDoctorProfileDto) {
    if (role === 'PATIENT') {
      const patch = dto as UpdatePatientProfileDto;
      const patient = await this.prisma.patient.update({
        where: { userId },
        data: {
          firstName: patch.firstName,
          lastName: patch.lastName,
          dateOfBirth: patch.dateOfBirth ? new Date(patch.dateOfBirth) : undefined,
          gender: patch.gender,
          bloodType: patch.bloodType,
          addressLine: patch.addressLine,
          city: patch.city,
          country: patch.country,
          emergencyContactName: patch.emergencyContactName,
          emergencyContactRelation: patch.emergencyContactRelation,
          emergencyContactPhone: patch.emergencyContactPhone,
          photoUrl: patch.photoUrl,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          gender: true,
          bloodType: true,
          city: true,
          country: true,
        },
      });
      return patient;
    }

    if (role === 'DOCTOR') {
      const patch = dto as UpdateDoctorProfileDto;
      const doctor = await this.prisma.doctor.update({
        where: { userId },
        data: {
          firstName: patch.firstName,
          lastName: patch.lastName,
          bio: patch.bio,
          consultationPrice: patch.consultationPrice ? parseFloat(patch.consultationPrice) : undefined,
          clinicName: patch.clinicName,
          addressLine: patch.addressLine,
          city: patch.city,
          country: patch.country,
          isAcceptingNewPatients: patch.isAcceptingNewPatients,
          photoUrl: patch.photoUrl,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          bio: true,
          consultationPrice: true,
          city: true,
          country: true,
          isAcceptingNewPatients: true,
        },
      });
      return doctor;
    }

    throw new ForbiddenException('Profile update not available for this role');
  }
}
