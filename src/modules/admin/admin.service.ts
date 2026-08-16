import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FilterAdminUsersDto,
  UpdateUserStatusDto,
  FilterAuditLogsDto,
  FilterLoginAttemptsDto,
  FilterSessionsDto,
} from './dto/admin.dto';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Users management ─────────────────────────────────────────────────────────

  async listUsers(filter: FilterAdminUsersDto) {
    const { role, status, q, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (role) where.role = role;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { patient: { firstName: { contains: q, mode: 'insensitive' } } },
        { patient: { lastName: { contains: q, mode: 'insensitive' } } },
        { doctor: { firstName: { contains: q, mode: 'insensitive' } } },
        { doctor: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          patient: {
            select: { id: true, firstName: true, lastName: true, photoUrl: true },
          },
          doctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialty: { select: { id: true, name: true } },
              photoUrl: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async updateUserStatus(adminUserId: string, adminRole: string, targetUserId: string, dto: UpdateUserStatusDto) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId, deletedAt: null } });
    if (!target) throw new NotFoundException('User not found');

    if (target.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot change the status of a SUPER_ADMIN account');
    }
    if (adminRole === 'ADMIN' && target.role === UserRole.ADMIN) {
      throw new ForbiddenException('An ADMIN cannot change another ADMIN account status');
    }
    if (target.id === adminUserId && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('You cannot suspend or deactivate your own account');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { status: dto.status },
        select: { id: true, email: true, role: true, status: true, updatedAt: true },
      });

      if (dto.status === UserStatus.SUSPENDED || dto.status === UserStatus.DEACTIVATED) {
        await tx.session.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date(), isCurrent: false },
        });
        await tx.refreshToken.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'USER_STATUS_CHANGED',
          entityType: 'User',
          entityId: targetUserId,
          metadata: { from: target.status, to: dto.status },
        },
      });

      return updated;
    });
  }

  // ── Audit logs ───────────────────────────────────────────────────────────────

  async listAuditLogs(filter: FilterAuditLogsDto) {
    const { userId, action, entityType, from, to, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Login attempts ───────────────────────────────────────────────────────────

  async listLoginAttempts(filter: FilterLoginAttemptsDto) {
    const { email, ipAddress, success, from, to, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (email) where.email = { contains: email, mode: 'insensitive' };
    if (ipAddress) where.ipAddress = ipAddress;
    if (success !== undefined) where.success = success;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [attempts, total] = await this.prisma.$transaction([
      this.prisma.loginAttempt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          ipAddress: true,
          userAgent: true,
          success: true,
          createdAt: true,
          user: { select: { id: true, email: true, role: true } },
        },
      }),
      this.prisma.loginAttempt.count({ where }),
    ]);

    return { attempts, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Sessions ─────────────────────────────────────────────────────────────────

  async listSessions(filter: FilterSessionsDto) {
    const { userId, onlyActive = true, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) where.userId = userId;
    if (onlyActive) {
      where.revokedAt = null;
      where.expiresAt = { gt: new Date() };
    }

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastActiveAt: 'desc' },
        select: {
          id: true,
          userId: true,
          deviceName: true,
          deviceType: true,
          ipAddress: true,
          location: true,
          userAgent: true,
          isCurrent: true,
          lastActiveAt: true,
          expiresAt: true,
          createdAt: true,
          revokedAt: true,
          user: { select: { email: true, role: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    return { sessions, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async revokeSession(adminUserId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.revokedAt) throw new BadRequestException('Session is already revoked');

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), isCurrent: false },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'SESSION_REVOKED',
          entityType: 'Session',
          entityId: sessionId,
          metadata: { targetUserId: session.userId },
        },
      }),
    ]);

    return { message: 'Session revoked' };
  }
}