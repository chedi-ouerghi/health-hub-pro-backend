import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { PatientsService } from "./patients.service";
import { MedicationsService } from "../medications/medications.service";
import { VitalsService } from "../vitals/vitals.service";
import { CreateMedicationDto } from "../medications/dto/medications.dto";
import { CreateVitalRecordDto } from "../vitals/dto/vitals.dto";
import { CreateActivityLogDto, FilterActivityLogsDto } from "./dto/patients.dto";
import { UpdatePatientProfileDto } from "../users/dto/update-profile.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { DoctorPatientAccessGuard } from "../../common/guards/doctor-patient-access.guard";
import { ParseCuidPipe } from "../../common/pipes/parse-uuid.pipe";

@ApiTags("Patients")
@ApiBearerAuth()
@Controller("patients")
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly medicationsService: MedicationsService,
    private readonly vitalsService: VitalsService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles("PATIENT")
  @Get("me")
  @ApiOperation({ summary: "Get own patient profile" })
  getMe(@CurrentUser("id") userId: string) {
    return this.patientsService.getMyProfile(userId);
  }

  @UseGuards(RolesGuard)
  @Roles("PATIENT")
  @Patch("me")
  @ApiOperation({ summary: "Update own patient profile" })
  updateMe(
    @CurrentUser("id") userId: string,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientsService.updateMyProfile(userId, dto);
  }

  @UseGuards(RolesGuard, DoctorPatientAccessGuard)
  @Roles("DOCTOR", "ADMIN", "SUPER_ADMIN")
  @Get(":id")
  @ApiOperation({
    summary: "Get patient profile (Doctor: own patients only; Admin: any)",
  })
  @ApiParam({ name: "id" })
  getById(
    @CurrentUser("role") requesterRole: string,
    @Param("id", ParseCuidPipe) patientId: string,
  ) {
    return this.patientsService.getPatientById(requesterRole, patientId);
  }

  // ── Patient medications (doctor side) ─────────────────────────────────────────

  @UseGuards(RolesGuard, DoctorPatientAccessGuard)
  @Roles("DOCTOR", "ADMIN", "SUPER_ADMIN")
  @Get(":id/medications")
  @ApiOperation({
    summary:
      "List a patient's medications (Doctor: own patients only; Admin: any)",
  })
  @ApiParam({ name: "id" })
  listPatientMedications(@Param("id", ParseCuidPipe) patientId: string) {
    return this.medicationsService.findForPatient(patientId);
  }

  @UseGuards(RolesGuard, DoctorPatientAccessGuard)
  @Roles("DOCTOR")
  @Post(":id/medications")
  @ApiOperation({
    summary: "Prescribe a medication to a patient (Doctor only)",
  })
  @ApiParam({ name: "id" })
  prescribeMedication(
    @CurrentUser("id") doctorUserId: string,
    @Param("id", ParseCuidPipe) patientId: string,
    @Body() dto: CreateMedicationDto,
  ) {
    return this.medicationsService.createForPatient(
      doctorUserId,
      patientId,
      dto,
    );
  }

  // ── Patient vitals (doctor side) ──────────────────────────────────────────────

  @UseGuards(RolesGuard, DoctorPatientAccessGuard)
  @Roles("DOCTOR", "ADMIN", "SUPER_ADMIN")
  @Get(":id/vitals")
  @ApiOperation({
    summary:
      "List a patient's vital records (Doctor: own patients only; Admin: any)",
  })
  @ApiParam({ name: "id" })
  listPatientVitals(@Param("id", ParseCuidPipe) patientId: string) {
    return this.vitalsService.findForPatient(patientId);
  }

  @UseGuards(RolesGuard, DoctorPatientAccessGuard)
  @Roles("DOCTOR")
  @Post(":id/vitals")
  @ApiOperation({
    summary: "Record a vital measurement for a patient (Doctor only)",
  })
  @ApiParam({ name: "id" })
  recordPatientVital(
    @CurrentUser("id") doctorUserId: string,
    @Param("id", ParseCuidPipe) patientId: string,
    @Body() dto: CreateVitalRecordDto,
  ) {
    return this.vitalsService.createForPatient(doctorUserId, patientId, dto);
  }

  // ── Patient activity logs (doctor/admin side) ────────────────────────────────

  @UseGuards(RolesGuard, DoctorPatientAccessGuard)
  @Roles("DOCTOR", "ADMIN", "SUPER_ADMIN")
  @Get(":id/activity-logs")
  @ApiOperation({
    summary:
      "List a patient's activity logs (Doctor: own patients only; Admin: any)",
  })
  @ApiParam({ name: "id" })
  listPatientActivityLogs(
    @Param("id", ParseCuidPipe) patientId: string,
    @Query() filter: FilterActivityLogsDto,
  ) {
    return this.patientsService.getPatientActivityLogs(
      patientId,
      filter.page,
      filter.limit,
    );
  }

  @UseGuards(RolesGuard)
  @Roles("DOCTOR", "ADMIN", "SUPER_ADMIN")
  @Post(":id/activity-logs")
  @ApiOperation({
    summary:
      "Internal: create an activity log entry for a patient (treating doctor, admin or system)",
  })
  @ApiParam({ name: "id" })
  createPatientActivityLog(
    @CurrentUser("id") requesterUserId: string,
    @CurrentUser("role") requesterRole: string,
    @Param("id", ParseCuidPipe) patientId: string,
    @Body() dto: CreateActivityLogDto,
  ) {
    return this.patientsService.createPatientActivityLog(
      requesterUserId,
      requesterRole,
      patientId,
      dto,
    );
  }
}
