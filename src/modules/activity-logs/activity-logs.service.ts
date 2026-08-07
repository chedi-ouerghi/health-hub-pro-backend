import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string, page = 1, limit = 20) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new ForbiddenException('Only patients can view patient activity logs');

    const skip = (page - 1) * limit;
    const [logs, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where: { patientId: patient.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityLog.count({ where: { patientId: patient.id } }),
    ]);

    return {
      logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
