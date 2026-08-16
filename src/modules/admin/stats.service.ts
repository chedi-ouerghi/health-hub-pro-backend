import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Global platform statistics — reserved for ADMIN / SUPER_ADMIN. */
  async getGlobalStats() {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalPatients,
      totalDoctors,
      totalAppointments,
      upcomingAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      appointmentsThisMonth,
      totalReviews,
      doctorsAgg,
      paidInvoicesAgg,
      pendingInvoicesAgg,
      refundedInvoicesAgg,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
      this.prisma.patient.count({ where: { deletedAt: null } }),
      this.prisma.doctor.count({ where: { deletedAt: null } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { status: 'UPCOMING' } }),
      this.prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.appointment.count({ where: { status: 'CANCELLED' } }),
      this.prisma.appointment.count({ where: { status: 'NO_SHOW' } }),
      this.prisma.appointment.count({ where: { scheduledAt: { gte: startOfMonth } } }),
      this.prisma.review.count(),
      this.prisma.doctor.aggregate({ _avg: { ratingAverage: true } }),
      this.prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'PENDING' },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'REFUNDED' },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
      },
      patients: totalPatients,
      doctors: totalDoctors,
      appointments: {
        total: totalAppointments,
        upcoming: upcomingAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        noShow: noShowAppointments,
        thisMonth: appointmentsThisMonth,
      },
      revenue: {
        paid: { count: paidInvoicesAgg._count.id, amount: Number(paidInvoicesAgg._sum.amount ?? 0) },
        pending: { count: pendingInvoicesAgg._count.id, amount: Number(pendingInvoicesAgg._sum.amount ?? 0) },
        refunded: { count: refundedInvoicesAgg._count.id, amount: Number(refundedInvoicesAgg._sum.amount ?? 0) },
      },
      reviews: totalReviews,
      doctorsRating: { average: Number(doctorsAgg._avg.ratingAverage ?? 0) },
    };
  }
}