import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdatePatientProfileDto, UpdateDoctorProfileDto } from './dto/update-profile.dto';

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
}
