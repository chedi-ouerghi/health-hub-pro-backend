import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/reviews.dto';
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

      // Recalculate doctor rating statistics
      const doctorReviews = await tx.review.findMany({
        where: { doctorId: appointment.doctorId },
        select: { rating: true },
      });

      const totalCount = doctorReviews.length;
      const totalSum = doctorReviews.reduce((acc, r) => acc + r.rating, 0);
      const avgRating = totalCount > 0 ? totalSum / totalCount : 0;
      const positiveCount = doctorReviews.filter((r) => r.rating >= 4).length;
      const recRate = totalCount > 0 ? (positiveCount / totalCount) * 100 : 0;

      await tx.doctor.update({
        where: { id: appointment.doctorId },
        data: {
          ratingAverage: avgRating,
          reviewCount: totalCount,
          recommendationRate: recRate,
        },
      });

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
