import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'List my notifications' })
  findMine(@CurrentUser('id') userId: string, @Query() pagination: PaginationDto) {
    return this.notificationsService.findMine(userId, pagination.page, pagination.limit);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id' })
  markAsRead(@CurrentUser('id') userId: string, @Param('id', ParseCuidPipe) id: string) {
    return this.notificationsService.markAsRead(userId, id);
  }
}
