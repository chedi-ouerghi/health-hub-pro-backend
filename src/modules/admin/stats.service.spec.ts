import { StatsService } from './stats.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma-mock';

describe('StatsService', () => {
  let service: StatsService;
  let m: PrismaMock;

  beforeEach(() => {
    m = createPrismaMock();
    service = new StatsService(m.prisma as any);
  });

  describe('getGlobalStats', () => {
    it('aggregates platform statistics', async () => {
      m.prisma.user.count.mockResolvedValue(10);
      m.prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8).mockResolvedValueOnce(1);
      m.prisma.patient.count.mockResolvedValue(6);
      m.prisma.doctor.count.mockResolvedValue(4);
      m.prisma.appointment.count.mockResolvedValue(30);
      m.prisma.appointment.count.mockResolvedValueOnce(30).mockResolvedValueOnce(12).mockResolvedValueOnce(10).mockResolvedValueOnce(5).mockResolvedValueOnce(1).mockResolvedValueOnce(7);
      m.prisma.review.count.mockResolvedValue(20);
      m.prisma.doctor.aggregate.mockResolvedValue({ _avg: { ratingAverage: 4.5 } });
      m.prisma.invoice.aggregate.mockResolvedValueOnce({ _count: { id: 8 }, _sum: { amount: 1200 } });
      m.prisma.invoice.aggregate.mockResolvedValueOnce({ _count: { id: 2 }, _sum: { amount: 300 } });
      m.prisma.invoice.aggregate.mockResolvedValueOnce({ _count: { id: 1 }, _sum: { amount: 50 } });

      const stats = await service.getGlobalStats();

      expect(stats.users).toEqual({ total: 10, active: 8, suspended: 1 });
      expect(stats.patients).toBe(6);
      expect(stats.doctors).toBe(4);
      expect(stats.appointments).toEqual({
        total: 30,
        upcoming: 12,
        completed: 10,
        cancelled: 5,
        noShow: 1,
        thisMonth: 7,
      });
      expect(stats.revenue).toEqual({
        paid: { count: 8, amount: 1200 },
        pending: { count: 2, amount: 300 },
        refunded: { count: 1, amount: 50 },
      });
      expect(stats.reviews).toBe(20);
      expect(stats.doctorsRating).toEqual({ average: 4.5 });
    });

    it('defaults null aggregates to zero', async () => {
      m.prisma.user.count.mockResolvedValue(0);
      m.prisma.patient.count.mockResolvedValue(0);
      m.prisma.doctor.count.mockResolvedValue(0);
      m.prisma.appointment.count.mockResolvedValue(0);
      m.prisma.review.count.mockResolvedValue(0);
      m.prisma.doctor.aggregate.mockResolvedValue({ _avg: { ratingAverage: null } });
      m.prisma.invoice.aggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { amount: null } });
      m.prisma.invoice.aggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { amount: null } });
      m.prisma.invoice.aggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { amount: null } });

      const stats = await service.getGlobalStats();

      expect(stats.doctorsRating.average).toBe(0);
      expect(stats.revenue.paid.amount).toBe(0);
    });
  });
});