import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateMedicationDto,
  UpdateMedicationDto,
  CreateMedicationLogDto,
} from "./dto/medications.dto";

@Injectable()
export class MedicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateMedicationDto) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient)
      throw new ForbiddenException("Only patients can track medications");

    return this.prisma.medication.create({
      data: {
        patientId: patient.id,
        name: dto.name,
        dose: dto.dose,
        scheduledTime: dto.scheduledTime,
      },
    });
  }

  async findMine(userId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient)
      throw new ForbiddenException("Only patients can track medications");

    return this.prisma.medication.findMany({
      where: { patientId: patient.id },
      include: {
        logs: { take: 5, orderBy: { loggedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * List a specific patient's medications (doctor/admin side).
   * Access control is enforced by DoctorPatientAccessGuard.
   */
  async findForPatient(patientId: string) {
    return this.prisma.medication.findMany({
      where: { patientId },
      include: {
        logs: { take: 5, orderBy: { loggedAt: "desc" } },
        prescribedByDoctor: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Prescribe a medication to a specific patient (doctor side).
   * Access control is enforced by DoctorPatientAccessGuard; an ActivityLog
   * (type PRESCRIPTION) is created so the patient sees it in their feed.
   */
  async createForPatient(
    userId: string,
    patientId: string,
    dto: CreateMedicationDto,
  ) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!doctor) throw new ForbiddenException("Doctor profile not found");

    return this.prisma.$transaction(async (tx) => {
      const medication = await tx.medication.create({
        data: {
          patientId,
          prescribedByDoctorId: doctor.id,
          name: dto.name,
          dose: dto.dose,
          scheduledTime: dto.scheduledTime,
        },
      });

      await tx.activityLog.create({
        data: {
          patientId,
          type: "PRESCRIPTION",
          title: `Nouveau médicament prescrit : ${dto.name}`,
          meta: `${dto.dose} · Dr. ${doctor.firstName} ${doctor.lastName}`,
        },
      });

      return medication;
    });
  }

  async update(
    userId: string,
    role: string,
    id: string,
    dto: UpdateMedicationDto,
  ) {
    const med = await this.prisma.medication.findUnique({ where: { id } });
    if (!med) throw new NotFoundException("Medication not found");

    await this.assertCanManage(userId, role, med);

    return this.prisma.medication.update({
      where: { id },
      data: dto,
    });
  }

  async delete(userId: string, role: string, id: string) {
    const med = await this.prisma.medication.findUnique({ where: { id } });
    if (!med) throw new NotFoundException("Medication not found");

    await this.assertCanManage(userId, role, med);

    await this.prisma.medication.delete({ where: { id } });
    return { message: "Medication deleted" };
  }

  /**
   * Qui peut gérer un médicament :
   *   - ADMIN / SUPER_ADMIN : tous
   *   - PATIENT : le sien uniquement
   *   - DOCTOR : uniquement celui qu'il a prescrit
   * Les erreurs sont remontées en NotFound pour ne pas révéler l'existence
   * d'un médicament qui n'appartient pas au demandeur.
   */
  private async assertCanManage(userId: string, role: string, med: any) {
    if (role === "ADMIN" || role === "SUPER_ADMIN") return;

    if (role === "PATIENT") {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
      });
      if (!patient || patient.id !== med.patientId)
        throw new NotFoundException("Medication not found");
      return;
    }

    if (role === "DOCTOR") {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!doctor || doctor.id !== med.prescribedByDoctorId)
        throw new NotFoundException("Medication not found");
      return;
    }

    throw new ForbiddenException("You cannot manage this medication");
  }

  async createLog(userId: string, id: string, dto: CreateMedicationLogDto) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient)
      throw new ForbiddenException("Only patients can log medication intake");

    const med = await this.prisma.medication.findUnique({ where: { id } });
    if (!med || med.patientId !== patient.id)
      throw new NotFoundException("Medication not found");

    return this.prisma.medicationLog.create({
      data: {
        medicationId: id,
        status: dto.status,
      },
    });
  }
}
