import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto, FilterNotificationsDto } from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string, filter: FilterNotificationsDto) {
    const { isRead, type, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;
    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;
    if (type) where.type = type;

    const [notifications, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications,
      unreadCount,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new ForbiddenException('Not your notification');

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  /** Mark all own notifications as read. */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'All notifications marked as read', count: result.count };
  }

  /**
   * Internal: create a notification (system, admin or scheduled jobs).
   * The endpoint is admin-restricted; internal services can call this
   * service method directly.
   */
  async create(requesterUserId: string, dto: CreateNotificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Recipient user not found');

    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          isRead: dto.isRead ?? false,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: requesterUserId,
          action: 'NOTIFICATION_CREATED',
          entityType: 'Notification',
          entityId: notification.id,
          metadata: { recipientUserId: dto.userId, type: dto.type },
        },
      });

      return notification;
    });
  }

  /** Delete a notification — owner or admin. */
  async remove(userId: string, role: string, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');

    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && notification.userId !== userId) {
      throw new ForbiddenException('Not your notification');
    }

    await this.prisma.$transaction([
      this.prisma.notification.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'NOTIFICATION_DELETED',
          entityType: 'Notification',
          entityId: id,
        },
      }),
    ]);
    return { message: 'Notification deleted' };
  }
}