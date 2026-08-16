import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';
import { UserRole, UserStatus } from '@prisma/client';

describe('AdminService', () => {
  let service: AdminService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new AdminService(m.prisma as any);
  });

  describe('listUsers', () => {
    it('returns paginated users with role/status/q filters', async () => {
      m.prisma.user.findMany.mockResolvedValue([{ id: 'u-1', email: 'a@b.io' }]);
      m.prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers({ role: UserRole.DOCTOR, status: UserStatus.ACTIVE, q: 'alice', page: 2, limit: 10 });

      expect(result.users).toEqual([{ id: 'u-1', email: 'a@b.io' }]);
      expect(result.meta.totalPages).toBe(1);
      expect(m.prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null, role: UserRole.DOCTOR, status: UserStatus.ACTIVE }),
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('updateUserStatus', () => {
    it('throws NotFoundException for unknown user', async () => {
      m.prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserStatus('admin-1', 'ADMIN', 'ghost', { status: UserStatus.SUSPENDED }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids changing a SUPER_ADMIN status', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'sa-1', role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE });

      await expect(
        service.updateUserStatus('admin-1', 'ADMIN', 'sa-1', { status: UserStatus.SUSPENDED }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids an ADMIN changing another ADMIN status', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'admin-2', role: UserRole.ADMIN, status: UserStatus.ACTIVE });

      await expect(
        service.updateUserStatus('admin-1', 'ADMIN', 'admin-2', { status: UserStatus.SUSPENDED }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids self-suspension', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: UserRole.DOCTOR, status: UserStatus.ACTIVE });

      await expect(
        service.updateUserStatus('admin-1', 'ADMIN', 'admin-1', { status: UserStatus.DEACTIVATED }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('suspends a user, revokes sessions/tokens and audits', async () => {
      m.prisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: UserRole.PATIENT, status: UserStatus.ACTIVE });
      m.tx.user.update.mockResolvedValue({ id: 'u-1', status: UserStatus.SUSPENDED });
      m.tx.session.updateMany.mockResolvedValue({ count: 1 });
      m.tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      m.tx.auditLog.create.mockResolvedValue({});

      const result = await service.updateUserStatus('admin-1', 'ADMIN', 'u-1', { status: UserStatus.SUSPENDED });

      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(m.tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-1', revokedAt: null } }),
      );
      expect(m.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'USER_STATUS_CHANGED',
            metadata: { from: 'ACTIVE', to: 'SUSPENDED' },
          }),
        }),
      );
    });
  });

  describe('listAuditLogs', () => {
    it('returns paginated audit logs with filters', async () => {
      m.prisma.auditLog.findMany.mockResolvedValue([{ id: 'a-1', action: 'APPOINTMENT_CREATED' }]);
      m.prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.listAuditLogs({ userId: 'u-1', action: 'APPOINTMENT_CREATED', from: '2026-08-01', to: '2026-08-31' });

      expect(result.logs).toEqual([{ id: 'a-1', action: 'APPOINTMENT_CREATED' }]);
      expect(m.prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u-1',
            action: 'APPOINTMENT_CREATED',
            createdAt: { gte: expect.any(Date), lte: expect.any(Date) },
          }),
        }),
      );
    });
  });

  describe('listLoginAttempts', () => {
    it('returns paginated attempts with email/success filters', async () => {
      m.prisma.loginAttempt.findMany.mockResolvedValue([{ id: 'la-1', success: false }]);
      m.prisma.loginAttempt.count.mockResolvedValue(1);

      const result = await service.listLoginAttempts({ email: 'alice@x.io', success: false });

      expect(result.attempts).toEqual([{ id: 'la-1', success: false }]);
      expect(m.prisma.loginAttempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: { contains: 'alice@x.io', mode: 'insensitive' }, success: false }),
        }),
      );
    });
  });

  describe('listSessions', () => {
    it('lists only active sessions by default', async () => {
      m.prisma.session.findMany.mockResolvedValue([{ id: 's-1' }]);
      m.prisma.session.count.mockResolvedValue(1);

      const result = await service.listSessions({});

      expect(result.sessions).toEqual([{ id: 's-1' }]);
      expect(m.prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null, expiresAt: { gt: expect.any(Date) } }),
        }),
      );
    });

    it('lists all sessions when onlyActive is false', async () => {
      m.prisma.session.findMany.mockResolvedValue([]);
      m.prisma.session.count.mockResolvedValue(0);

      await service.listSessions({ onlyActive: false });

      expect(m.prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('revokeSession', () => {
    it('throws NotFoundException for unknown session', async () => {
      m.prisma.session.findUnique.mockResolvedValue(null);

      await expect(service.revokeSession('admin-1', 's-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects already revoked sessions', async () => {
      m.prisma.session.findUnique.mockResolvedValue({ id: 's-1', revokedAt: new Date() });

      await expect(service.revokeSession('admin-1', 's-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('revokes the session and audits', async () => {
      m.prisma.session.findUnique.mockResolvedValue({ id: 's-1', revokedAt: null, userId: 'u-1' });
      m.prisma.session.update.mockResolvedValue({ id: 's-1', revokedAt: new Date() });
      m.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.revokeSession('admin-1', 's-1');

      expect(result.message).toContain('revoked');
      expect(m.prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isCurrent: false }) }),
      );
    });
  });
});