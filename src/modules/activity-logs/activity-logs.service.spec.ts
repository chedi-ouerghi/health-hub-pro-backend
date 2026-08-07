import { ForbiddenException } from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('ActivityLogsService', () => {
  let service: ActivityLogsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new ActivityLogsService(m.prisma as any);
  });

  it('throws ForbiddenException for non-patient users', async () => {
    m.prisma.patient.findUnique.mockResolvedValue(null);

    await expect(service.findMine('user-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns patient activity logs with meta', async () => {
    m.prisma.patient.findUnique.mockResolvedValue({ id: 'pat-1' });
    m.prisma.activityLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
    m.prisma.activityLog.count.mockResolvedValue(1);

    const result = await service.findMine('user-1', 1, 10);

    expect(result.logs).toEqual([{ id: 'log-1' }]);
    expect(result.meta.total).toBe(1);
    expect(m.prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: 'pat-1' }, take: 10 }),
    );
  });
});
