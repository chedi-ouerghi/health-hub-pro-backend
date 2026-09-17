import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';
import {
    ChangePasswordDto,
    ConfirmEmailVerificationDto,
    DisableTwoFactorDto,
    EnableTwoFactorDto,
    FilterMySessionsDto,
    RequestEmailVerificationDto,
} from './dto/security.dto';
import { UpdateDoctorProfileDto, UpdatePatientProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile (includes patient/doctor sub-profile)' })
  getMe(@CurrentUser('id') userId: string, @CurrentUser('role') role: string) {
    return this.usersService.getMe(userId, role);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: UpdatePatientProfileDto | UpdateDoctorProfileDto,
  ) {
    return this.usersService.updateMe(userId, role, dto);
  }

  // ── My active sessions (devices) ─────────────────────────────────────────────

  @Get('me/sessions')
  @ApiOperation({ summary: 'List my active sessions/devices (paged)' })
  getMySessions(@CurrentUser('id') userId: string, @Query() filter: FilterMySessionsDto) {
    return this.usersService.getMySessions(userId, filter);
  }

  @Delete('me/sessions/:sessionId')
  @ApiOperation({ summary: 'Revoke one of my sessions (current session is forbidden — use logout)' })
  @ApiParam({ name: 'sessionId' })
  revokeMySession(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string | undefined,
    @Param('sessionId', ParseCuidPipe) sessionId: string,
  ) {
    return this.usersService.revokeMySession(userId, sessionId, currentSessionId);
  }

  // ── Change password ──────────────────────────────────────────────────────────

  @Patch('me/password')
  @ApiOperation({ summary: 'Change my password (other sessions are revoked)' })
  changePassword(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, currentSessionId, dto);
  }

  // ── Two-factor authentication ────────────────────────────────────────────────

  @Post('me/2fa/enable')
  @ApiOperation({ summary: 'Enable 2FA — returns the TOTP secret and a QR code (otpauth URL)' })
  enableTwoFactor(@CurrentUser('id') userId: string, @Body() dto?: EnableTwoFactorDto) {
    return this.usersService.enableTwoFactor(userId, dto);
  }

  @Post('me/2fa/disable')
  @ApiOperation({ summary: 'Disable 2FA (requires a valid TOTP code)' })
  disableTwoFactor(@CurrentUser('id') userId: string, @Body() dto: DisableTwoFactorDto) {
    return this.usersService.disableTwoFactor(userId, dto);
  }

  // ── Email verification ───────────────────────────────────────────────────────

  @Post('me/phone/verify')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Send an email verification code (legacy route)' })
  requestEmailVerificationLegacy(@CurrentUser('id') userId: string, @Body() dto: RequestEmailVerificationDto) {
    return this.usersService.requestEmailVerification(userId, dto);
  }

  @Post('me/phone/verify/confirm')
  @ApiOperation({ summary: 'Confirm the email code (legacy route)' })
  confirmEmailVerificationLegacy(@CurrentUser('id') userId: string, @Body() dto: ConfirmEmailVerificationDto) {
    return this.usersService.confirmEmailVerification(userId, dto);
  }

  @Post('me/email/verify')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Send an email verification code' })
  requestEmailVerification(@CurrentUser('id') userId: string, @Body() dto: RequestEmailVerificationDto) {
    return this.usersService.requestEmailVerification(userId, dto);
  }

  @Post('me/email/verify/confirm')
  @ApiOperation({ summary: 'Confirm the email code and mark the email as verified' })
  confirmEmailVerification(@CurrentUser('id') userId: string, @Body() dto: ConfirmEmailVerificationDto) {
    return this.usersService.confirmEmailVerification(userId, dto);
  }
}