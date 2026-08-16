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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import {
  FilterDoctorsDto,
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
  CreateEducationDto,
  UpdateEducationDto,
  CreateCertificateDto,
  UpdateCertificateDto,
  AddFocusAreaDto,
  AddLanguageDto,
  SearchDoctorsDto,
} from './dto/doctors.dto';
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

  // ── Public advanced search (must be declared BEFORE :id) ────────────────────

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Advanced combined doctor search (query, specialty, city, language, price range)' })
  @ApiQuery({ name: 'query', required: false, description: 'Free-text on name / clinic / specialty' })
  @ApiQuery({ name: 'specialty', required: false, description: 'Specialty name, slug or ID' })
  @ApiQuery({ name: 'language', required: false, description: 'Language name or ISO code' })
  search(@Query() filter: SearchDoctorsDto) {
    return this.doctorsService.search(filter);
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

  // ── Education ─────────────────────────────────────────────────────────────────

  @Public()
  @Get(':id/education')
  @ApiOperation({ summary: "List doctor's education history" })
  @ApiParam({ name: 'id' })
  getEducations(
    @Param('id', ParseCuidPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.doctorsService.getDoctorEducations(id, pagination.page, pagination.limit);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Post('me/education')
  @ApiOperation({ summary: 'Add an education record to my profile' })
  createEducation(@CurrentUser('id') userId: string, @Body() dto: CreateEducationDto) {
    return this.doctorsService.createEducation(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Patch('me/education/:educationId')
  @ApiOperation({ summary: 'Update one of my education records' })
  @ApiParam({ name: 'educationId' })
  updateEducation(
    @CurrentUser('id') userId: string,
    @Param('educationId', ParseCuidPipe) educationId: string,
    @Body() dto: UpdateEducationDto,
  ) {
    return this.doctorsService.updateEducation(userId, educationId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Delete('me/education/:educationId')
  @ApiOperation({ summary: 'Delete one of my education records' })
  @ApiParam({ name: 'educationId' })
  deleteEducation(
    @CurrentUser('id') userId: string,
    @Param('educationId', ParseCuidPipe) educationId: string,
  ) {
    return this.doctorsService.deleteEducation(userId, educationId);
  }

  // ── Certificates ──────────────────────────────────────────────────────────────

  @Public()
  @Get(':id/certificates')
  @ApiOperation({ summary: "List doctor's certificates" })
  @ApiParam({ name: 'id' })
  getCertificates(
    @Param('id', ParseCuidPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.doctorsService.getDoctorCertificates(id, pagination.page, pagination.limit);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Post('me/certificates')
  @ApiOperation({ summary: 'Add a certificate to my profile' })
  createCertificate(@CurrentUser('id') userId: string, @Body() dto: CreateCertificateDto) {
    return this.doctorsService.createCertificate(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Patch('me/certificates/:certificateId')
  @ApiOperation({ summary: 'Update one of my certificates' })
  @ApiParam({ name: 'certificateId' })
  updateCertificate(
    @CurrentUser('id') userId: string,
    @Param('certificateId', ParseCuidPipe) certificateId: string,
    @Body() dto: UpdateCertificateDto,
  ) {
    return this.doctorsService.updateCertificate(userId, certificateId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Delete('me/certificates/:certificateId')
  @ApiOperation({ summary: 'Delete one of my certificates' })
  @ApiParam({ name: 'certificateId' })
  deleteCertificate(
    @CurrentUser('id') userId: string,
    @Param('certificateId', ParseCuidPipe) certificateId: string,
  ) {
    return this.doctorsService.deleteCertificate(userId, certificateId);
  }

  // ── Focus areas ───────────────────────────────────────────────────────────────

  @Public()
  @Get(':id/focus-areas')
  @ApiOperation({ summary: "List doctor's focus areas" })
  @ApiParam({ name: 'id' })
  getFocusAreas(@Param('id', ParseCuidPipe) id: string) {
    return this.doctorsService.getDoctorFocusAreas(id);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Post('me/focus-areas')
  @ApiOperation({ summary: 'Add a focus area to my profile' })
  addFocusArea(@CurrentUser('id') userId: string, @Body() dto: AddFocusAreaDto) {
    return this.doctorsService.addFocusArea(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Delete('me/focus-areas/:focusAreaId')
  @ApiOperation({ summary: 'Remove a focus area from my profile' })
  @ApiParam({ name: 'focusAreaId' })
  removeFocusArea(
    @CurrentUser('id') userId: string,
    @Param('focusAreaId', ParseCuidPipe) focusAreaId: string,
  ) {
    return this.doctorsService.removeFocusArea(userId, focusAreaId);
  }

  // ── Languages ─────────────────────────────────────────────────────────────────

  @Public()
  @Get(':id/languages')
  @ApiOperation({ summary: "List doctor's spoken languages" })
  @ApiParam({ name: 'id' })
  getLanguages(@Param('id', ParseCuidPipe) id: string) {
    return this.doctorsService.getDoctorLanguages(id);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Post('me/languages')
  @ApiOperation({ summary: 'Add a language to my profile' })
  addLanguage(@CurrentUser('id') userId: string, @Body() dto: AddLanguageDto) {
    return this.doctorsService.addLanguage(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('DOCTOR')
  @Delete('me/languages/:languageId')
  @ApiOperation({ summary: 'Remove a language from my profile' })
  @ApiParam({ name: 'languageId' })
  removeLanguage(
    @CurrentUser('id') userId: string,
    @Param('languageId', ParseCuidPipe) languageId: string,
  ) {
    return this.doctorsService.removeLanguage(userId, languageId);
  }
}
