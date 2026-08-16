import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSpecialtyDto,
  UpdateSpecialtyDto,
  CreateLanguageDto,
  UpdateLanguageDto,
  CreateFocusAreaDto,
  UpdateFocusAreaDto,
} from './dto/admin.dto';

/**
 * Admin CRUD for the referentials (specialties, languages, focus areas).
 *
 * Deletion policy (physical, justified):
 * - Specialty: physical delete is BLOCKED while doctors are still linked to it
 *   (Doctor.specialtyId is required and historical appts keep the name via
 *   snapshots). Keeps referential integrity without touching the schema.
 * - Language / FocusArea: joined through pure join tables (DoctorLanguage /
 *   DoctorFocusArea) → rows are unlinked first, then the record is deleted.
 *   Deleting a language/focus area only affects the profile association.
 */
@Injectable()
export class ReferentialsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Specialties ─────────────────────────────────────────────────────────────

  async createSpecialty(adminUserId: string, dto: CreateSpecialtyDto) {
    try {
      const specialty = await this.prisma.$transaction(async (tx) => {
        const created = await tx.specialty.create({
          data: { name: dto.name.trim(), slug: this._slugify(dto.name), description: dto.description },
        });
        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'SPECIALTY_CREATED',
            entityType: 'Specialty',
            entityId: created.id,
            metadata: { name: created.name },
          },
        });
        return created;
      });
      return specialty;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('A specialty with this name or slug already exists');
      throw err;
    }
  }

  async updateSpecialty(adminUserId: string, id: string, dto: UpdateSpecialtyDto) {
    if (!dto.name && dto.description === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.specialty.findUnique({ where: { id } });
        if (!existing) throw new BadRequestException('Specialty not found');
        const record = await tx.specialty.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            slug: dto.name ? this._slugify(dto.name) : undefined,
            description: dto.description,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'SPECIALTY_UPDATED',
            entityType: 'Specialty',
            entityId: id,
            metadata: { previousName: existing.name, newName: record.name },
          },
        });
        return record;
      });
      return updated;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('A specialty with this name or slug already exists');
      if (err instanceof BadRequestException) throw err;
      throw err;
    }
  }

  async deleteSpecialty(adminUserId: string, id: string) {
    const specialty = await this.prisma.specialty.findUnique({ where: { id } });
    if (!specialty) throw new BadRequestException('Specialty not found');

    const linkedDoctors = await this.prisma.doctor.count({ where: { specialtyId: id, deletedAt: null } });
    if (linkedDoctors > 0) {
      throw new ConflictException(
        `Cannot delete: ${linkedDoctors} doctor(s) are still linked to this specialty`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.specialty.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'SPECIALTY_DELETED',
          entityType: 'Specialty',
          entityId: id,
          metadata: { name: specialty.name },
        },
      }),
    ]);

    return { message: 'Specialty deleted' };
  }

  // ── Languages ───────────────────────────────────────────────────────────────

  async createLanguage(adminUserId: string, dto: CreateLanguageDto) {
    try {
      const language = await this.prisma.$transaction(async (tx) => {
        const created = await tx.language.create({
          data: { name: dto.name.trim(), code: dto.code.trim().toLowerCase() },
        });
        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'LANGUAGE_CREATED',
            entityType: 'Language',
            entityId: created.id,
            metadata: { name: created.name, code: created.code },
          },
        });
        return created;
      });
      return language;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('A language with this name or code already exists');
      throw err;
    }
  }

  async updateLanguage(adminUserId: string, id: string, dto: UpdateLanguageDto) {
    if (!dto.name && !dto.code) throw new BadRequestException('Nothing to update');
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.language.findUnique({ where: { id } });
        if (!existing) throw new BadRequestException('Language not found');
        const record = await tx.language.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            code: dto.code?.trim().toLowerCase(),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'LANGUAGE_UPDATED',
            entityType: 'Language',
            entityId: id,
            metadata: { previousName: existing.name, newName: record.name },
          },
        });
        return record;
      });
      return updated;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('A language with this name or code already exists');
      if (err instanceof BadRequestException) throw err;
      throw err;
    }
  }

  async deleteLanguage(adminUserId: string, id: string) {
    const language = await this.prisma.language.findUnique({ where: { id } });
    if (!language) throw new BadRequestException('Language not found');

    await this.prisma.$transaction([
      this.prisma.doctorLanguage.deleteMany({ where: { languageId: id } }),
      this.prisma.language.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'LANGUAGE_DELETED',
          entityType: 'Language',
          entityId: id,
          metadata: { name: language.name },
        },
      }),
    ]);

    return { message: 'Language deleted' };
  }

  // ── Focus areas ─────────────────────────────────────────────────────────────

  async createFocusArea(adminUserId: string, dto: CreateFocusAreaDto) {
    try {
      const focusArea = await this.prisma.$transaction(async (tx) => {
        const created = await tx.focusArea.create({ data: { name: dto.name.trim() } });
        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'FOCUS_AREA_CREATED',
            entityType: 'FocusArea',
            entityId: created.id,
            metadata: { name: created.name },
          },
        });
        return created;
      });
      return focusArea;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('A focus area with this name already exists');
      throw err;
    }
  }

  async updateFocusArea(adminUserId: string, id: string, dto: UpdateFocusAreaDto) {
    if (!dto.name) throw new BadRequestException('Nothing to update');
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.focusArea.findUnique({ where: { id } });
        if (!existing) throw new BadRequestException('Focus area not found');
        const record = await tx.focusArea.update({ where: { id }, data: { name: dto.name.trim() } });
        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'FOCUS_AREA_UPDATED',
            entityType: 'FocusArea',
            entityId: id,
            metadata: { previousName: existing.name, newName: record.name },
          },
        });
        return record;
      });
      return updated;
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('A focus area with this name already exists');
      if (err instanceof BadRequestException) throw err;
      throw err;
    }
  }

  async deleteFocusArea(adminUserId: string, id: string) {
    const focusArea = await this.prisma.focusArea.findUnique({ where: { id } });
    if (!focusArea) throw new BadRequestException('Focus area not found');

    await this.prisma.$transaction([
      this.prisma.doctorFocusArea.deleteMany({ where: { focusAreaId: id } }),
      this.prisma.focusArea.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'FOCUS_AREA_DELETED',
          entityType: 'FocusArea',
          entityId: id,
          metadata: { name: focusArea.name },
        },
      }),
    ]);

    return { message: 'Focus area deleted' };
  }

  private _slugify(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }
}