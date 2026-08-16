import { Controller, Get, Patch, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdatePatientProfileDto, UpdateDoctorProfileDto } from './dto/update-profile.dto';
import {
  ChangePasswordDto,
  EnableTwoFactorDto,
  DisableTwoFactorDto,
  RequestPhoneVerificationDto,
  ConfirmPhoneVerificationDto,
  FilterMySessionsDto,
} from './dto/security.dto';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';

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

  // ── Phone verification ───────────────────────────────────────────────────────

  @Post('me/phone/verify')
  @ApiOperation({ summary: 'Send an SMS verification code to my phone' })
  requestPhoneVerification(@CurrentUser('id') userId: string, @Body() dto: RequestPhoneVerificationDto) {
    return this.usersService.requestPhoneVerification(userId, dto);
  }

  @Post('me/phone/verify/confirm')
  @ApiOperation({ summary: 'Confirm the SMS code and mark the phone as verified' })
  confirmPhoneVerification(@CurrentUser('id') userId: string, @Body() dto: ConfirmPhoneVerificationDto) {
    return this.usersService.confirmPhoneVerification(userId, dto);
  }
}