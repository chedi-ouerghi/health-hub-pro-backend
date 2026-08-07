import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVitalRecordDto } from './dto/vitals.dto';

@Injectable()
export class VitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateVitalRecordDto) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new ForbiddenException('Only patients can log vital records');

    return this.prisma.vitalRecord.create({
      data: {
        patientId: patient.id,
        heartRate: dto.heartRate,
        systolic: dto.systolic,
        diastolic: dto.diastolic,
        sleepHours: dto.sleepHours,
        steps: dto.steps,
      },
    });
  }

  async findMine(userId: string, limit = 50) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new ForbiddenException('Only patients can view vital records');

    return this.prisma.vitalRecord.findMany({
      where: { patientId: patient.id },
      take: limit,
      orderBy: { recordedAt: 'desc' },
    });
  }

  /**
   * List a specific patient's vital records (doctor/admin side).
   * Access control is enforced by DoctorPatientAccessGuard.
   */
  async findForPatient(patientId: string, limit = 50) {
    return this.prisma.vitalRecord.findMany({
      where: { patientId },
      include: {
        recordedByDoctor: { select: { id: true, firstName: true, lastName: true } },
      },
      take: limit,
      orderBy: { recordedAt: 'desc' },
    });
  }

  /**
   * Record a vital measurement for a specific patient (doctor side).
   * Access control is enforced by DoctorPatientAccessGuard.
   */
  async createForPatient(userId: string, patientId: string, dto: CreateVitalRecordDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!doctor) throw new ForbiddenException('Doctor profile not found');

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.vitalRecord.create({
        data: {
          patientId,
          recordedByDoctorId: doctor.id,
          heartRate: dto.heartRate,
          systolic: dto.systolic,
          diastolic: dto.diastolic,
          sleepHours: dto.sleepHours,
          steps: dto.steps,
        },
      });

      await tx.activityLog.create({
        data: {
          patientId,
          type: 'FILE',
          title: 'Nouvelle mesure enregistrée',
          meta: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        },
      });

      return record;
    });
  }
}
