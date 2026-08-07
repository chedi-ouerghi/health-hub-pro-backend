import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new NotificationsService(m.prisma as any);
  });

  describe('findMine', () => {
    it('returns notifications, unread count and meta', async () => {
      m.prisma.notification.findMany.mockResolvedValue([{ id: 'n-1', isRead: false }]);
      m.prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const result = await service.findMine('user-1', 1, 10);

      expect(result.notifications).toEqual([{ id: 'n-1', isRead: false }]);
      expect(result.unreadCount).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(m.prisma.notification.count).toHaveBeenCalledTimes(2);
    });

    it('computes totalPages correctly', async () => {
      m.prisma.notification.findMany.mockResolvedValue([]);
      m.prisma.notification.count.mockResolvedValueOnce(25).mockResolvedValueOnce(3);

      const result = await service.findMine('user-1', 1, 10);

      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('markAsRead', () => {
    it('throws NotFoundException for unknown notification', async () => {
      m.prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markAsRead('user-1', 'n-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids marking another user notification', async () => {
      m.prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'user-9' });

      await expect(service.markAsRead('user-1', 'n-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('marks own notification as read', async () => {
      m.prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'user-1' });
      m.prisma.notification.update.mockResolvedValue({ id: 'n-1', isRead: true });

      const result = await service.markAsRead('user-1', 'n-1');

      expect(result.isRead).toBe(true);
      expect(m.prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isRead: true } }),
      );
    });
  });
});
