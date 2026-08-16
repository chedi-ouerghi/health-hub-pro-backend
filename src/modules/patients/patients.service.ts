import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpdatePatientProfileDto } from "../users/dto/update-profile.dto";
import { CreateActivityLogDto } from "./dto/patients.dto";

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

  // ── Activity logs ────────────────────────────────────────────────────────────

  /**
   * List a patient's activity logs.
   * Access control (Admin: any patient; Doctor: own patients via appointments)
   * is enforced by DoctorPatientAccessGuard — this method only fetches.
   */
  async getPatientActivityLogs(patientId: string, page = 1, limit = 20) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const skip = (page - 1) * limit;
    const [logs, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where: { patientId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.activityLog.count({ where: { patientId } }),
    ]);

    return { logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Internal creation of a patient activity log (system / admin / treating doctor).
   * Doctors must have an appointment with the patient; admins & system services
   * are allowed. Patients cannot record activity for themselves.
   */
  async createPatientActivityLog(
    requesterUserId: string,
    requesterRole: string,
    patientId: string,
    dto: CreateActivityLogDto,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    if (requesterRole === "DOCTOR") {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: requesterUserId },
        select: { id: true },
      });
      if (!doctor) throw new ForbiddenException("Doctor profile not found");

      const hasAppointment = await this.prisma.appointment.findFirst({
        where: { doctorId: doctor.id, patientId },
        select: { id: true },
      });
      if (!hasAppointment) {
        throw new ForbiddenException("You have no appointment with this patient");
      }
    }
    // ADMIN / SUPER_ADMIN (system) are allowed by role guard.

    return this.prisma.$transaction(async (tx) => {
      const log = await tx.activityLog.create({
        data: { patientId, type: dto.type, title: dto.title, meta: dto.meta },
      });
      await tx.auditLog.create({
        data: {
          userId: requesterUserId,
          action: "ACTIVITY_LOG_CREATED",
          entityType: "ActivityLog",
          entityId: log.id,
          metadata: { patientId, type: dto.type },
        },
      });
      return log;
    });
  }
}
