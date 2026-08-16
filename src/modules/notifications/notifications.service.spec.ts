import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';
import { NotificationType } from '@prisma/client';

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

      const result = await service.findMine('user-1', {});

      expect(result.notifications).toEqual([{ id: 'n-1', isRead: false }]);
      expect(result.unreadCount).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(m.prisma.notification.count).toHaveBeenCalledTimes(2);
    });

    it('applies isRead / type filters', async () => {
      m.prisma.notification.findMany.mockResolvedValue([]);
      m.prisma.notification.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      await service.findMine('user-1', { isRead: false, type: NotificationType.INVOICE, page: 1, limit: 5 });

      expect(m.prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', isRead: false, type: NotificationType.INVOICE }),
          take: 5,
        }),
      );
    });

    it('computes totalPages correctly', async () => {
      m.prisma.notification.findMany.mockResolvedValue([]);
      m.prisma.notification.count.mockResolvedValueOnce(25).mockResolvedValueOnce(3);

      const result = await service.findMine('user-1', { page: 1, limit: 10 });

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

  describe('markAllAsRead', () => {
    it('updates all unread notifications of the user', async () => {
      m.prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('user-1');

      expect(result.count).toBe(3);
      expect(m.prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', isRead: false }, data: { isRead: true } }),
      );
    });
  });

  describe('create', () => {
    it('throws NotFoundException for unknown recipient', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create('admin-1', {
          userId: 'ghost',
          type: NotificationType.SYSTEM,
          title: 'T',
          body: 'B',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates notification + audit log', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      m.tx.notification.create.mockResolvedValue({ id: 'n-1', userId: 'user-1' });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.create('admin-1', {
        userId: 'user-1',
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Rendez-vous confirmé',
        body: 'Votre RDV est confirmé.',
        isRead: true,
      });

      expect(result.id).toBe('n-1');
      expect(m.tx.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', isRead: true }) }),
      );
      expect(m.tx.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for unknown notification', async () => {
      m.prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.remove('user-1', 'PATIENT', 'n-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids non-owner non-admin deletion', async () => {
      m.prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'user-9' });

      await expect(service.remove('user-1', 'PATIENT', 'n-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the owner to delete', async () => {
      m.prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'user-1' });
      m.prisma.notification.delete.mockResolvedValue({ id: 'n-1' });
      m.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.remove('user-1', 'PATIENT', 'n-1');

      expect(result.message).toContain('deleted');
      expect(m.prisma.notification.delete).toHaveBeenCalledWith({ where: { id: 'n-1' } });
    });

    it('allows admin to delete any notification', async () => {
      m.prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'user-9' });
      m.prisma.notification.delete.mockResolvedValue({ id: 'n-1' });
      m.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.remove('admin-1', 'ADMIN', 'n-1');

      expect(result.message).toContain('deleted');
    });
  });
});