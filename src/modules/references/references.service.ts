import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllLanguages() {
    return this.prisma.language.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async getAllFocusAreas() {
    return this.prisma.focusArea.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}