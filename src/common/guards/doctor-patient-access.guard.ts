import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Contrôle l'accès au dossier médical d'un patient (médicaments / constantes /
 * profil) :
 *
 *   - GET  :  ADMIN / SUPER_ADMIN (n'importe quel patient)  |  DOCTOR (patients
 *            liés par un rendez-vous uniquement)
 *   - POST :  DOCTOR uniquement (prescrire / enregistrer une constante) —
 *            l'ADMIN reste en lecture seule, il ne prescrit ni n'enregistre.
 *
 * Le lien patient ↔ médecin est vérifié via les rendez-vous existants
 * (relation Appointment), source unique de vérité. Le rôle PATIENT est refusé.
 */
@Injectable()
export class DoctorPatientAccessGuard implements CanActivate {
  private readonly logger = new Logger(DoctorPatientAccessGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const patientId: string = request.params?.id;

    if (!user) {
      this.logger.warn("DoctorPatientAccessGuard: no user on request");
      throw new ForbiddenException("Authentication required");
    }

    const isRead = request.method === "GET";

    if (user.role === "PATIENT") {
      throw new ForbiddenException("Patients cannot view other patients");
    }

    if (user.role === "DOCTOR") {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!doctor) throw new ForbiddenException("Doctor profile not found");

      const hasAppointment = await this.prisma.appointment.findFirst({
        where: { doctorId: doctor.id, patientId },
        select: { id: true },
      });
      if (!hasAppointment) {
        throw new ForbiddenException(
          "You have no appointment with this patient",
        );
      }
      return true;
    }

    // ADMIN / SUPER_ADMIN : accès en lecture seule au dossier patient
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      if (isRead) return true;
      throw new ForbiddenException(
        "Admins cannot prescribe or record patient data",
      );
    }

    this.logger.warn(
      `DoctorPatientAccessGuard: DENIED role=${user.role} method=${request.method}`,
    );
    throw new ForbiddenException("Access denied");
  }
}
