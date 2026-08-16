import { Controller, Get, Patch, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ReferentialsService } from './referentials.service';
import {
  FilterAdminUsersDto,
  UpdateUserStatusDto,
  FilterAuditLogsDto,
  FilterLoginAttemptsDto,
  FilterSessionsDto,
  CreateSpecialtyDto,
  UpdateSpecialtyDto,
  CreateLanguageDto,
  UpdateLanguageDto,
  CreateFocusAreaDto,
  UpdateFocusAreaDto,
} from './dto/admin.dto';
import { StatsService } from './stats.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly statsService: StatsService,
  ) {}

  // ── Users ────────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List users with role / status / text filters (Admin only)' })
  listUsers(@Query() filter: FilterAdminUsersDto) {
    return this.adminService.listUsers(filter);
  }

  @Patch('users/:userId/status')
  @ApiOperation({ summary: 'Activate / suspend / deactivate a user (Admin only)' })
  @ApiParam({ name: 'userId' })
  updateUserStatus(
    @CurrentUser('id') adminUserId: string,
    @CurrentUser('role') adminRole: string,
    @Param('userId', ParseCuidPipe) userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(adminUserId, adminRole, userId, dto);
  }

  // ── Audit & security ─────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'Browse audit logs (filters: userId, action, entityType, date range)' })
  listAuditLogs(@Query() filter: FilterAuditLogsDto) {
    return this.adminService.listAuditLogs(filter);
  }

  @Get('login-attempts')
  @ApiOperation({ summary: 'Browse login attempts (filters: email, ip, success, date range)' })
  listLoginAttempts(@Query() filter: FilterLoginAttemptsDto) {
    return this.adminService.listLoginAttempts(filter);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions (filters: userId, onlyActive)' })
  listSessions(@Query() filter: FilterSessionsDto) {
    return this.adminService.listSessions(filter);
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Revoke a session (Admin only)' })
  @ApiParam({ name: 'sessionId' })
  revokeSession(
    @CurrentUser('id') adminUserId: string,
    @Param('sessionId', ParseCuidPipe) sessionId: string,
  ) {
    return this.adminService.revokeSession(adminUserId, sessionId);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class ReferentialsController {
  constructor(private readonly referentialsService: ReferentialsService) {}

  // ── Specialties ─────────────────────────────────────────────────────────────

  @Post('specialties')
  @ApiOperation({ summary: 'Create a specialty (Admin only)' })
  createSpecialty(@CurrentUser('id') adminUserId: string, @Body() dto: CreateSpecialtyDto) {
    return this.referentialsService.createSpecialty(adminUserId, dto);
  }

  @Patch('specialties/:id')
  @ApiOperation({ summary: 'Update a specialty (Admin only)' })
  @ApiParam({ name: 'id' })
  updateSpecialty(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateSpecialtyDto,
  ) {
    return this.referentialsService.updateSpecialty(adminUserId, id, dto);
  }

  @Delete('specialties/:id')
  @ApiOperation({ summary: 'Delete a specialty (blocked while doctors are linked, Admin only)' })
  @ApiParam({ name: 'id' })
  deleteSpecialty(@CurrentUser('id') adminUserId: string, @Param('id', ParseCuidPipe) id: string) {
    return this.referentialsService.deleteSpecialty(adminUserId, id);
  }

  // ── Languages ───────────────────────────────────────────────────────────────

  @Post('languages')
  @ApiOperation({ summary: 'Create a language (Admin only)' })
  createLanguage(@CurrentUser('id') adminUserId: string, @Body() dto: CreateLanguageDto) {
    return this.referentialsService.createLanguage(adminUserId, dto);
  }

  @Patch('languages/:id')
  @ApiOperation({ summary: 'Update a language (Admin only)' })
  @ApiParam({ name: 'id' })
  updateLanguage(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.referentialsService.updateLanguage(adminUserId, id, dto);
  }

  @Delete('languages/:id')
  @ApiOperation({ summary: 'Delete a language (Admin only)' })
  @ApiParam({ name: 'id' })
  deleteLanguage(@CurrentUser('id') adminUserId: string, @Param('id', ParseCuidPipe) id: string) {
    return this.referentialsService.deleteLanguage(adminUserId, id);
  }

  // ── Focus areas ─────────────────────────────────────────────────────────────

  @Post('focus-areas')
  @ApiOperation({ summary: 'Create a focus area (Admin only)' })
  createFocusArea(@CurrentUser('id') adminUserId: string, @Body() dto: CreateFocusAreaDto) {
    return this.referentialsService.createFocusArea(adminUserId, dto);
  }

  @Patch('focus-areas/:id')
  @ApiOperation({ summary: 'Update a focus area (Admin only)' })
  @ApiParam({ name: 'id' })
  updateFocusArea(
    @CurrentUser('id') adminUserId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateFocusAreaDto,
  ) {
    return this.referentialsService.updateFocusArea(adminUserId, id, dto);
  }

  @Delete('focus-areas/:id')
  @ApiOperation({ summary: 'Delete a focus area (Admin only)' })
  @ApiParam({ name: 'id' })
  deleteFocusArea(@CurrentUser('id') adminUserId: string, @Param('id', ParseCuidPipe) id: string) {
    return this.referentialsService.deleteFocusArea(adminUserId, id);
  }
}

@ApiTags('Statistics')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Global platform statistics (appointments, revenue, users…) — Admin only' })
  getGlobalStats() {
    return this.statsService.getGlobalStats();
  }
}