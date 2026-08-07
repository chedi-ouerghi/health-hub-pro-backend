import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FilterDoctorsDto, CreateAvailabilityDto, UpdateAvailabilityDto } from './dto/doctors.dto';
import { UpdateDoctorProfileDto } from '../users/dto/update-profile.dto';
import { JS_DAY_TO_PRISMA } from '../../common/utils/club-time.util';
import { DayOfWeek } from '@prisma/client';

const DOCTOR_PUBLIC_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  specialty: { select: { id: true, name: true, slug: true } },
  licenseNumber: true,
  isLicenseVerified: true,
  yearsOfExperience: true,
  bio: true,
  consultationPrice: true,
  currency: true,
  clinicName: true,
  addressLine: true,
  city: true,
  country: true,
  latitude: true,
  longitude: true,
  ratingAverage: true,
  reviewCount: true,
  patientCount: true,
  recommendationRate: true,
  isAcceptingNewPatients: true,
  createdAt: true,
};

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List ─────────────────────────────────────────────────────────────────────

  async findAll(filter: FilterDoctorsDto) {
    const { specialtyId, city, availableToday, isAcceptingNewPatients, page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (specialtyId) where.specialtyId = specialtyId;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (isAcceptingNewPatients !== undefined) where.isAcceptingNewPatients = isAcceptingNewPatients;

    if (availableToday) {
      const jsDayIndex = new Date().getDay(); // 0=Sunday
      const prismaDay = JS_DAY_TO_PRISMA[jsDayIndex] as DayOfWeek;
      where.availabilities = { some: { dayOfWeek: prismaDay, isActive: true } };
    }

    const [doctors, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        select: {
          ...DOCTOR_PUBLIC_SELECT,
          availabilities: { where: { isActive: true }, select: { dayOfWeek: true, startTime: true, endTime: true, slotMinutes: true } },
        },
        skip,
        take: limit,
        orderBy: { ratingAverage: 'desc' },
      }),
      this.prisma.doctor.count({ where }),
    ]);

    return {
      doctors,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Single doctor ─────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id, deletedAt: null },
      select: {
        ...DOCTOR_PUBLIC_SELECT,
        educations: { select: { id: true, school: true, degree: true, startYear: true, endYear: true } },
        certificates: { select: { id: true, name: true, issuedBy: true, issuedAt: true } },
        focusAreas: { select: { focusArea: { select: { id: true, name: true } } } },
        languages: { select: { language: { select: { id: true, name: true, code: true } } } },
        availabilities: {
          where: { isActive: true },
          select: { id: true, dayOfWeek: true, startTime: true, endTime: true, slotMinutes: true },
        },
      },
    });

    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  // ── Update my profile ─────────────────────────────────────────────────────────

  async updateMyProfile(userId: string, dto: UpdateDoctorProfileDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    return this.prisma.doctor.update({
      where: { userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        bio: dto.bio,
        consultationPrice: dto.consultationPrice ? parseFloat(dto.consultationPrice) : undefined,
        clinicName: dto.clinicName,
        addressLine: dto.addressLine,
        city: dto.city,
        country: dto.country,
        isAcceptingNewPatients: dto.isAcceptingNewPatients,
        photoUrl: dto.photoUrl,
      },
      select: DOCTOR_PUBLIC_SELECT,
    });
  }

  // ── Availabilities ────────────────────────────────────────────────────────────

  async getAvailabilities(doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId, deletedAt: null },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    return this.prisma.availability.findMany({
      where: { doctorId },
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true, slotMinutes: true, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createAvailability(userId: string, dto: CreateAvailabilityDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    // Check no overlap with existing slots on same day
    const existing = await this.prisma.availability.findMany({
      where: { doctorId: doctor.id, dayOfWeek: dto.dayOfWeek, isActive: true },
    });

    const { timesOverlap } = await import('../../common/utils/club-time.util');
    for (const slot of existing) {
      if (timesOverlap(dto.startTime, dto.endTime, slot.startTime, slot.endTime)) {
        throw new ConflictException(`Overlaps with existing slot ${slot.startTime}-${slot.endTime}`);
      }
    }

    return this.prisma.availability.create({
      data: {
        doctorId: doctor.id,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotMinutes: dto.slotMinutes ?? 30,
      },
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true, slotMinutes: true, isActive: true },
    });
  }

  async updateAvailability(userId: string, availId: string, dto: UpdateAvailabilityDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const slot = await this.prisma.availability.findUnique({ where: { id: availId } });
    if (!slot || slot.doctorId !== doctor.id) throw new ForbiddenException('Not your availability slot');

    return this.prisma.availability.update({
      where: { id: availId },
      data: dto,
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true, slotMinutes: true, isActive: true },
    });
  }

  async deleteAvailability(userId: string, availId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const slot = await this.prisma.availability.findUnique({ where: { id: availId } });
    if (!slot || slot.doctorId !== doctor.id) throw new ForbiddenException('Not your availability slot');

    await this.prisma.availability.delete({ where: { id: availId } });
    return { message: 'Availability slot deleted' };
  }

  // ── Reviews list ─────────────────────────────────────────────────────────────

  async getDoctorReviews(doctorId: string, page = 1, limit = 20) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId, deletedAt: null }, select: { id: true } });
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
          patient: { select: { firstName: true, lastName: true, photoUrl: true } },
        },
      }),
      this.prisma.review.count({ where: { doctorId } }),
    ]);

    return { reviews, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
