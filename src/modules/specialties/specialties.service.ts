import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, description: true },
    });
  }
}
