import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto, FilterNotificationsDto } from './dto/notifications.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ── Internal creation (admin / system) ───────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post()
  @ApiOperation({ summary: 'Internal: create a notification (Admin only)' })
  create(@CurrentUser('id') requesterUserId: string, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(requesterUserId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my notifications (filters: isRead, type)' })
  findMine(@CurrentUser('id') userId: string, @Query() filter: FilterNotificationsDto) {
    return this.notificationsService.findMine(userId, filter);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id' })
  markAsRead(@CurrentUser('id') userId: string, @Param('id', ParseCuidPipe) id: string) {
    return this.notificationsService.markAsRead(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification (owner or admin)' })
  @ApiParam({ name: 'id' })
  remove(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseCuidPipe) id: string,
  ) {
    return this.notificationsService.remove(userId, role, id);
  }
}