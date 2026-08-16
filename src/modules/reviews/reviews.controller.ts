import { Controller, Post, Patch, Delete, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewDto } from './dto/reviews.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(RolesGuard)
  @Roles('PATIENT')
  @Post()
  @ApiOperation({ summary: 'Leave a review for a completed appointment (Patient only)' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(userId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('PATIENT')
  @Get('me')
  @ApiOperation({ summary: 'List the reviews I wrote (Patient only)' })
  findMine(@CurrentUser('id') userId: string, @Query() pagination: PaginationDto) {
    return this.reviewsService.findMine(userId, pagination.page, pagination.limit);
  }

  @UseGuards(RolesGuard)
  @Roles('PATIENT')
  @Patch(':id')
  @ApiOperation({ summary: 'Update one of my reviews (Patient only)' })
  @ApiParam({ name: 'id' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(userId, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('PATIENT')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of my reviews (Patient only)' })
  @ApiParam({ name: 'id' })
  remove(@CurrentUser('id') userId: string, @Param('id', ParseCuidPipe) id: string) {
    return this.reviewsService.remove(userId, id);
  }
}
