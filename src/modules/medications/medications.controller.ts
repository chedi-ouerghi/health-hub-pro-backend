import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { MedicationsService } from "./medications.service";
import {
  CreateMedicationDto,
  UpdateMedicationDto,
  CreateMedicationLogDto,
} from "./dto/medications.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ParseCuidPipe } from "../../common/pipes/parse-uuid.pipe";

@ApiTags("Medications")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("PATIENT")
@Controller("medications")
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Post()
  @ApiOperation({ summary: "Add a new medication to track" })
  create(@CurrentUser("id") userId: string, @Body() dto: CreateMedicationDto) {
    return this.medicationsService.create(userId, dto);
  }

  @Get("me")
  @ApiOperation({ summary: "List my medications" })
  findMine(@CurrentUser("id") userId: string) {
    return this.medicationsService.findMine(userId);
  }

  @UseGuards(RolesGuard)
  @Roles("PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN")
  @Patch(":id")
  @ApiOperation({
    summary:
      "Update a medication (owner patient, prescribing doctor, or Admin)",
  })
  @ApiParam({ name: "id" })
  update(
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Param("id", ParseCuidPipe) id: string,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.medicationsService.update(userId, role, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN")
  @Delete(":id")
  @ApiOperation({
    summary:
      "Delete a medication (owner patient, prescribing doctor, or Admin)",
  })
  @ApiParam({ name: "id" })
  delete(
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Param("id", ParseCuidPipe) id: string,
  ) {
    return this.medicationsService.delete(userId, role, id);
  }

  @Post(":id/logs")
  @ApiOperation({
    summary: "Log medication intake status (TAKEN, MISSED, SKIPPED)",
  })
  @ApiParam({ name: "id" })
  createLog(
    @CurrentUser("id") userId: string,
    @Param("id", ParseCuidPipe) id: string,
    @Body() dto: CreateMedicationLogDto,
  ) {
    return this.medicationsService.createLog(userId, id, dto);
  }
}
