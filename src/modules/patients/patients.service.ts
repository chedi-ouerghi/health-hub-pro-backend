import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpdatePatientProfileDto } from "../users/dto/update-profile.dto";

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId, deletedAt: null },
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
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true, phone: true, status: true } },
      },
    });

    if (!patient) throw new NotFoundException("Patient profile not found");
    return patient;
  }

  async updateMyProfile(userId: string, dto: UpdatePatientProfileDto) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException("Patient profile not found");

    return this.prisma.patient.update({
      where: { userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        bloodType: dto.bloodType,
        addressLine: dto.addressLine,
        city: dto.city,
        country: dto.country,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactRelation: dto.emergencyContactRelation,
        emergencyContactPhone: dto.emergencyContactPhone,
        photoUrl: dto.photoUrl,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        gender: true,
        bloodType: true,
        dateOfBirth: true,
        addressLine: true,
        city: true,
        country: true,
        emergencyContactName: true,
        emergencyContactRelation: true,
        emergencyContactPhone: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Get a specific patient by ID.
   * Access control (Admin: any patient; Doctor: own patients via appointments)
   * is enforced by DoctorPatientAccessGuard — this method only fetches.
   */
  async getPatientById(_requesterRole: string, patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        dateOfBirth: true,
        gender: true,
        bloodType: true,
        membershipPlan: true,
        memberSince: true,
        user: { select: { email: true, phone: true } },
      },
    });

    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }
}
