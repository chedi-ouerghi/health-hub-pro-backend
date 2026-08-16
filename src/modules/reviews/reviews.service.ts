import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto, UpdateReviewDto } from './dto/reviews.dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId, deletedAt: null },
    });
    if (!patient) {
      throw new ForbiddenException('Only patients can create reviews');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { review: true },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.patientId !== patient.id) {
      throw new ForbiddenException('You can only review your own appointments');
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException('You can only leave a review for COMPLETED appointments');
    }

    if (appointment.review) {
      throw new ConflictException('A review has already been submitted for this appointment');
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const createdReview = await tx.review.create({
        data: {
          patientId: patient.id,
          doctorId: appointment.doctorId,
          appointmentId: appointment.id,
          rating: dto.rating,
          comment: dto.comment,
        },
      });

      await this._recomputeDoctorRatingStats(tx, appointment.doctorId);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'REVIEW_CREATED',
          entityType: 'Review',
          entityId: createdReview.id,
          metadata: { doctorId: appointment.doctorId, rating: dto.rating },
        },
      });

      return createdReview;
    });

    return review;
  }

  // ── My reviews (patient) ─────────────────────────────────────────────────────

  async findMine(userId: string, page = 1, limit = 20) {
    const patient = await this.prisma.patient.findUnique({ where: { userId, deletedAt: null } });
    if (!patient) throw new ForbiddenException('Only patients can view their reviews');

    const skip = (page - 1) * limit;
    const [reviews, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { patientId: patient.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          doctor: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
          appointment: { select: { id: true, scheduledAt: true } },
        },
      }),
      this.prisma.review.count({ where: { patientId: patient.id } }),
    ]);

    return { reviews, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Update my review (patient) ───────────────────────────────────────────────

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const patient = await this.prisma.patient.findUnique({ where: { userId, deletedAt: null } });
    if (!patient) throw new ForbiddenException('Only patients can update reviews');

    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.patientId !== patient.id) throw new ForbiddenException('You can only update your own reviews');
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException('At least one field (rating or comment) must be provided');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedReview = await tx.review.update({
        where: { id: reviewId },
        data: {
          rating: dto.rating,
          comment: dto.comment,
        },
      });

      await this._recomputeDoctorRatingStats(tx, review.doctorId);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'REVIEW_UPDATED',
          entityType: 'Review',
          entityId: reviewId,
          metadata: { doctorId: review.doctorId, changes: { ...dto } },
        },
      });

      return updatedReview;
    });

    return updated;
  }

  // ── Delete my review (patient) ───────────────────────────────────────────────

  /**
   * NOTE: the Review model has no `deletedAt` column in the Prisma schema, so a
   * hard delete is performed (schema must not be modified). Doctor rating stats
   * are recomputed afterwards.
   */
  async remove(userId: string, reviewId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId, deletedAt: null } });
    if (!patient) throw new ForbiddenException('Only patients can delete reviews');

    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.patientId !== patient.id) throw new ForbiddenException('You can only delete your own reviews');

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });

      await this._recomputeDoctorRatingStats(tx, review.doctorId);

      await tx.auditLog.create({
        data: {
          userId,
          action: 'REVIEW_DELETED',
          entityType: 'Review',
          entityId: reviewId,
          metadata: { doctorId: review.doctorId },
        },
      });
    });

    return { message: 'Review deleted' };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async _recomputeDoctorRatingStats(tx: any, doctorId: string) {
    const doctorReviews = await tx.review.findMany({
      where: { doctorId },
      select: { rating: true },
    });

    const totalCount = doctorReviews.length;
    const totalSum = doctorReviews.reduce((acc: number, r: { rating: number }) => acc + r.rating, 0);
    const avgRating = totalCount > 0 ? totalSum / totalCount : 0;
    const positiveCount = doctorReviews.filter((r: { rating: number }) => r.rating >= 4).length;
    const recRate = totalCount > 0 ? (positiveCount / totalCount) * 100 : 0;

    await tx.doctor.update({
      where: { id: doctorId },
      data: {
        ratingAverage: avgRating,
        reviewCount: totalCount,
        recommendationRate: recRate,
      },
    });
  }

  async getDoctorReviews(doctorId: string, page = 1, limit = 20) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId, deletedAt: null },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const skip = (page - 1) * limit;
    const [reviews, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { doctorId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          patient: {
            select: { firstName: true, lastName: true, photoUrl: true },
          },
        },
      }),
      this.prisma.review.count({ where: { doctorId } }),
    ]);

    return {
      reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
