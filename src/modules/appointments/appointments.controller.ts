import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentStatusDto,
  RescheduleAppointmentDto,
  FilterAppointmentsDto,
} from './dto/appointments.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApproveReservationsGuard } from '../../common/guards/approve-reservations.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ── Book appointment ─────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('PATIENT')
  @Post()
  @ApiOperation({ summary: 'Book an in-person appointment with a doctor' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(userId, dto);
  }

  // ── List mine ────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get my appointments (patient: own; doctor: agenda; admin: all)' })
  findMine(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query() filter: FilterAppointmentsDto,
  ) {
    return this.appointmentsService.findMine(userId, role, filter);
  }

  // ── Get single ───────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a single appointment by ID' })
  @ApiParam({ name: 'id' })
  findOne(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseCuidPipe) id: string,
  ) {
    return this.appointmentsService.findOne(userId, role, id);
  }

  // ── Update status (doctor/admin only) ────────────────────────────────────────

  @UseGuards(ApproveReservationsGuard)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update appointment status (Doctor owner or Admin)' })
  @ApiParam({ name: 'id' })
  updateStatus(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(userId, role, id, dto);
  }

  // ── Reschedule (patient owner or doctor) ────────────────────────────────────

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule an UPCOMING appointment (patient owner or doctor of the appointment)' })
  @ApiParam({ name: 'id' })
  reschedule(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(userId, role, id, dto);
  }

  // ── Patient cancel ───────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('PATIENT')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment (patient only, before cutoff)' })
  @ApiParam({ name: 'id' })
  cancel(
    @CurrentUser('id') userId: string,
    @Param('id', ParseCuidPipe) id: string,
  ) {
    return this.appointmentsService.cancelByPatient(userId, id);
  }
}
