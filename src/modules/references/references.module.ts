import { Module } from '@nestjs/common';
import { ReferencesService } from './references.service';
import { LanguagesController, FocusAreasController } from './references.controller';

@Module({
  controllers: [LanguagesController, FocusAreasController],
  providers: [ReferencesService],
})
export class ReferencesModule {}