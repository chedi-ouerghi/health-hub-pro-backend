import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import { FilterDoctorsDto, CreateAvailabilityDto, UpdateAvailabilityDto } from './dto/doctors.dto';
import { UpdateDoctorProfileDto } from '../users/dto/update-profile.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CacheTTL } from '../../common/decorators/cache-ttl.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  // ── Public list ───────────────────────────────────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({ summary: 'List doctors with filters' })
  findAll(@Query() filter: FilterDoctorsDto) {
    return this.doctorsService.findAll(filter);
  }

  // ── Doctor own profile update ─────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Patch('me')
  @ApiOperation({ summary: "Update own doctor profile" })
  updateMyProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateDoctorProfileDto) {
    return this.doctorsService.updateMyProfile(userId, dto);
  }

  // ── Own availabilities ────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Post('me/availabilities')
  @ApiOperation({ summary: 'Add a new availability slot' })
  createAvailability(@CurrentUser('id') userId: string, @Body() dto: CreateAvailabilityDto) {
    return this.doctorsService.createAvailability(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Patch('me/availabilities/:availId')
  @ApiOperation({ summary: 'Update an availability slot' })
  @ApiParam({ name: 'availId' })
  updateAvailability(
    @CurrentUser('id') userId: string,
    @Param('availId', ParseCuidPipe) availId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.doctorsService.updateAvailability(userId, availId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Delete('me/availabilities/:availId')
  @ApiOperation({ summary: 'Delete an availability slot' })
  @ApiParam({ name: 'availId' })
  deleteAvailability(
    @CurrentUser('id') userId: string,
    @Param('availId', ParseCuidPipe) availId: string,
  ) {
    return this.doctorsService.deleteAvailability(userId, availId);
  }

  // ── Public single doctor ──────────────────────────────────────────────────────

  @Public()
  @CacheTTL(120) // 2 minutes cache on doctor profiles
  @Get(':id')
  @ApiOperation({ summary: 'Get doctor profile with full details' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id', ParseCuidPipe) id: string) {
    return this.doctorsService.findOne(id);
  }

  // ── Doctor availabilities (public) ────────────────────────────────────────────

  @Public()
  @Get(':id/availabilities')
  @ApiOperation({ summary: "Get doctor's active availability slots" })
  @ApiParam({ name: 'id' })
  getAvailabilities(@Param('id', ParseCuidPipe) id: string) {
    return this.doctorsService.getAvailabilities(id);
  }

  // ── Doctor reviews (public) ───────────────────────────────────────────────────

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: "List doctor's reviews" })
  @ApiParam({ name: 'id' })
  getReviews(
    @Param('id', ParseCuidPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.doctorsService.getDoctorReviews(id, pagination.page, pagination.limit);
  }
}
