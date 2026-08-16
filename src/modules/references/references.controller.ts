import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReferencesService } from './references.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('References')
@Controller()
export class LanguagesController {
  constructor(private readonly referencesService: ReferencesService) {}

  @Public()
  @Get('languages')
  @ApiOperation({ summary: 'List all languages (used by GET /doctors/:id/languages)' })
  getAllLanguages() {
    return this.referencesService.getAllLanguages();
  }
}

@ApiTags('References')
@Controller()
export class FocusAreasController {
  constructor(private readonly referencesService: ReferencesService) {}

  @Public()
  @Get('focus-areas')
  @ApiOperation({ summary: 'List all focus areas (used by GET /doctors/:id/focus-areas)' })
  getAllFocusAreas() {
    return this.referencesService.getAllFocusAreas();
  }
}