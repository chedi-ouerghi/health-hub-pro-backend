import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FilterDoctorsDto,
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
  CreateEducationDto,
  UpdateEducationDto,
  CreateCertificateDto,
  UpdateCertificateDto,
  AddFocusAreaDto,
  AddLanguageDto,
  SearchDoctorsDto,
} from './dto/doctors.dto';
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

  // ── Education ────────────────────────────────────────────────────────────────

  async getDoctorEducations(doctorId: string, page = 1, limit = 20) {
    await this._assertDoctorExists(doctorId);
    const skip = (page - 1) * limit;
    const [educations, total] = await this.prisma.$transaction([
      this.prisma.education.findMany({
        where: { doctorId },
        skip,
        take: limit,
        orderBy: { startYear: 'desc' },
        select: { id: true, school: true, degree: true, startYear: true, endYear: true },
      }),
      this.prisma.education.count({ where: { doctorId } }),
    ]);
    return { educations, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createEducation(userId: string, dto: CreateEducationDto) {
    const doctor = await this._assertDoctorProfile(userId);

    const education = await this.prisma.$transaction(async (tx) => {
      const created = await tx.education.create({
        data: { doctorId: doctor.id, ...dto },
        select: { id: true, school: true, degree: true, startYear: true, endYear: true },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'EDUCATION_CREATED',
          entityType: 'Education',
          entityId: created.id,
          metadata: { doctorId: doctor.id, school: dto.school },
        },
      });
      return created;
    });
    return education;
  }

  async updateEducation(userId: string, educationId: string, dto: UpdateEducationDto) {
    const doctor = await this._assertDoctorProfile(userId);
    const education = await this.prisma.education.findUnique({ where: { id: educationId } });
    if (!education) throw new NotFoundException('Education not found');
    if (education.doctorId !== doctor.id) throw new ForbiddenException('Not your education record');

    return this.prisma.education.update({
      where: { id: educationId },
      data: dto,
      select: { id: true, school: true, degree: true, startYear: true, endYear: true },
    });
  }

  async deleteEducation(userId: string, educationId: string) {
    const doctor = await this._assertDoctorProfile(userId);
    const education = await this.prisma.education.findUnique({ where: { id: educationId } });
    if (!education) throw new NotFoundException('Education not found');
    if (education.doctorId !== doctor.id) throw new ForbiddenException('Not your education record');

    await this.prisma.$transaction([
      this.prisma.education.delete({ where: { id: educationId } }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'EDUCATION_DELETED',
          entityType: 'Education',
          entityId: educationId,
          metadata: { doctorId: doctor.id },
        },
      }),
    ]);
    return { message: 'Education record deleted' };
  }

  // ── Certificates ─────────────────────────────────────────────────────────────

  async getDoctorCertificates(doctorId: string, page = 1, limit = 20) {
    await this._assertDoctorExists(doctorId);
    const skip = (page - 1) * limit;
    const [certificates, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({
        where: { doctorId },
        skip,
        take: limit,
        orderBy: { issuedAt: 'desc' },
        select: { id: true, name: true, issuedBy: true, issuedAt: true },
      }),
      this.prisma.certificate.count({ where: { doctorId } }),
    ]);
    return { certificates, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createCertificate(userId: string, dto: CreateCertificateDto) {
    const doctor = await this._assertDoctorProfile(userId);

    const certificate = await this.prisma.$transaction(async (tx) => {
      const created = await tx.certificate.create({
        data: {
          doctorId: doctor.id,
          name: dto.name,
          issuedBy: dto.issuedBy,
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        },
        select: { id: true, name: true, issuedBy: true, issuedAt: true },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'CERTIFICATE_CREATED',
          entityType: 'Certificate',
          entityId: created.id,
          metadata: { doctorId: doctor.id, name: dto.name },
        },
      });
      return created;
    });
    return certificate;
  }

  async updateCertificate(userId: string, certificateId: string, dto: UpdateCertificateDto) {
    const doctor = await this._assertDoctorProfile(userId);
    const certificate = await this.prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!certificate) throw new NotFoundException('Certificate not found');
    if (certificate.doctorId !== doctor.id) throw new ForbiddenException('Not your certificate');

    return this.prisma.certificate.update({
      where: { id: certificateId },
      data: {
        name: dto.name,
        issuedBy: dto.issuedBy,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
      },
      select: { id: true, name: true, issuedBy: true, issuedAt: true },
    });
  }

  async deleteCertificate(userId: string, certificateId: string) {
    const doctor = await this._assertDoctorProfile(userId);
    const certificate = await this.prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!certificate) throw new NotFoundException('Certificate not found');
    if (certificate.doctorId !== doctor.id) throw new ForbiddenException('Not your certificate');

    await this.prisma.$transaction([
      this.prisma.certificate.delete({ where: { id: certificateId } }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'CERTIFICATE_DELETED',
          entityType: 'Certificate',
          entityId: certificateId,
          metadata: { doctorId: doctor.id },
        },
      }),
    ]);
    return { message: 'Certificate deleted' };
  }

  // ── Focus areas ──────────────────────────────────────────────────────────────

  async getDoctorFocusAreas(doctorId: string) {
    await this._assertDoctorExists(doctorId);
    return this.prisma.doctorFocusArea.findMany({
      where: { doctorId },
      select: { focusArea: { select: { id: true, name: true } } },
      orderBy: { focusArea: { name: 'asc' } },
    });
  }

  async addFocusArea(userId: string, dto: AddFocusAreaDto) {
    const doctor = await this._assertDoctorProfile(userId);
    const focusArea = await this.prisma.focusArea.findUnique({ where: { id: dto.focusAreaId } });
    if (!focusArea) throw new NotFoundException('FocusArea not found');

    try {
      const relation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.doctorFocusArea.create({
          data: { doctorId: doctor.id, focusAreaId: dto.focusAreaId },
          select: { focusArea: { select: { id: true, name: true } } },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'FOCUS_AREA_ADDED',
            entityType: 'DoctorFocusArea',
            entityId: `${doctor.id}_${dto.focusAreaId}`,
            metadata: { doctorId: doctor.id, focusAreaId: dto.focusAreaId },
          },
        });
        return created;
      });
      return relation;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('This focus area is already added');
      throw err;
    }
  }

  async removeFocusArea(userId: string, focusAreaId: string) {
    const doctor = await this._assertDoctorProfile(userId);
    const relation = await this.prisma.doctorFocusArea.findUnique({
      where: { doctorId_focusAreaId: { doctorId: doctor.id, focusAreaId } },
    });
    if (!relation) throw new NotFoundException('Focus area not found on this doctor');

    await this.prisma.$transaction([
      this.prisma.doctorFocusArea.deleteMany({
        where: { doctorId: doctor.id, focusAreaId },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'FOCUS_AREA_REMOVED',
          entityType: 'DoctorFocusArea',
          entityId: `${doctor.id}_${focusAreaId}`,
          metadata: { doctorId: doctor.id, focusAreaId },
        },
      }),
    ]);
    return { message: 'Focus area removed' };
  }

  // ── Languages ────────────────────────────────────────────────────────────────

  async getDoctorLanguages(doctorId: string) {
    await this._assertDoctorExists(doctorId);
    return this.prisma.doctorLanguage.findMany({
      where: { doctorId },
      select: { language: { select: { id: true, name: true, code: true } } },
      orderBy: { language: { name: 'asc' } },
    });
  }

  async addLanguage(userId: string, dto: AddLanguageDto) {
    const doctor = await this._assertDoctorProfile(userId);
    const language = await this.prisma.language.findUnique({ where: { id: dto.languageId } });
    if (!language) throw new NotFoundException('Language not found');

    try {
      const relation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.doctorLanguage.create({
          data: { doctorId: doctor.id, languageId: dto.languageId },
          select: { language: { select: { id: true, name: true, code: true } } },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'LANGUAGE_ADDED',
            entityType: 'DoctorLanguage',
            entityId: `${doctor.id}_${dto.languageId}`,
            metadata: { doctorId: doctor.id, languageId: dto.languageId },
          },
        });
        return created;
      });
      return relation;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('This language is already added');
      throw err;
    }
  }

  async removeLanguage(userId: string, languageId: string) {
    const doctor = await this._assertDoctorProfile(userId);
    const relation = await this.prisma.doctorLanguage.findUnique({
      where: { doctorId_languageId: { doctorId: doctor.id, languageId } },
    });
    if (!relation) throw new NotFoundException('Language not found on this doctor');

    await this.prisma.$transaction([
      this.prisma.doctorLanguage.deleteMany({
        where: { doctorId: doctor.id, languageId },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'LANGUAGE_REMOVED',
          entityType: 'DoctorLanguage',
          entityId: `${doctor.id}_${languageId}`,
          metadata: { doctorId: doctor.id, languageId },
        },
      }),
    ]);
    return { message: 'Language removed' };
  }

  // ── Advanced search ──────────────────────────────────────────────────────────

  async search(filter: SearchDoctorsDto) {
    const { query, specialty, city, language, minPrice, maxPrice, sort = 'rating', order = 'desc', page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (query) {
      where.OR = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { clinicName: { contains: query, mode: 'insensitive' } },
        { specialty: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

    if (specialty) {
      where.specialty = {
        OR: [
          { id: specialty },
          { slug: { equals: specialty, mode: 'insensitive' } },
          { name: { contains: specialty, mode: 'insensitive' } },
        ],
      };
    }

    if (city) where.city = { contains: city, mode: 'insensitive' };

    if (language) {
      where.languages = {
        some: {
          language: {
            OR: [
              { code: { equals: language, mode: 'insensitive' } },
              { name: { contains: language, mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    if (minPrice !== undefined && maxPrice !== undefined) {
      if (minPrice > maxPrice) throw new BadRequestException('minPrice must be <= maxPrice');
    }
    if (minPrice !== undefined) where.consultationPrice = { gte: minPrice, ...(where.consultationPrice ?? {}) };
    if (maxPrice !== undefined) where.consultationPrice = { ...(where.consultationPrice ?? {}), lte: maxPrice };

    let orderBy: any;
    switch (sort) {
      case 'experience':
        orderBy = { yearsOfExperience: order };
        break;
      case 'price':
        orderBy = { consultationPrice: order };
        break;
      case 'name':
        orderBy = [{ lastName: order }, { firstName: order }];
        break;
      default:
        orderBy = { ratingAverage: order };
    }

    const [doctors, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        select: {
          ...DOCTOR_PUBLIC_SELECT,
          availabilities: { where: { isActive: true }, select: { dayOfWeek: true, startTime: true, endTime: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.doctor.count({ where }),
    ]);

    return { doctors, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _assertDoctorExists(doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId, deletedAt: null }, select: { id: true } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  private async _assertDoctorProfile(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    return doctor;
  }
}
