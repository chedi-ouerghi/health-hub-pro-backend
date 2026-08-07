import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SpecialtiesService } from './specialties.service';
import { Public } from '../../common/decorators/public.decorator';
import { CacheTTL } from '../../common/decorators/cache-ttl.decorator';

@ApiTags('Specialties')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Public()
  @CacheTTL(300) // Cache for 5 minutes
  @Get()
  @ApiOperation({ summary: 'List all medical specialties (public, cached)' })
  findAll() {
    return this.specialtiesService.findAll();
  }
}
