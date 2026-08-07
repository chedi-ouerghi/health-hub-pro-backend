import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VitalsService } from './vitals.service';
import { CreateVitalRecordDto } from './dto/vitals.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Vitals')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('PATIENT')
@Controller('vitals')
export class VitalsController {
  constructor(private readonly vitalsService: VitalsService) {}

  @Post()
  @ApiOperation({ summary: 'Log a new vital record' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateVitalRecordDto) {
    return this.vitalsService.create(userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my vital records' })
  findMine(@CurrentUser('id') userId: string, @Query() pagination: PaginationDto) {
    return this.vitalsService.findMine(userId, pagination.limit);
  }
}
