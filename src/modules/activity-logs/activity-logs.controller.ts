import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityLogsService } from './activity-logs.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Activity Logs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('PATIENT')
@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get('me')
  @ApiOperation({ summary: 'List my medical activity logs (Patient only)' })
  findMine(@CurrentUser('id') userId: string, @Query() pagination: PaginationDto) {
    return this.activityLogsService.findMine(userId, pagination.page, pagination.limit);
  }
}
