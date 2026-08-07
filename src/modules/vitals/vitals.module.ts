import { Module } from '@nestjs/common';
import { VitalsService } from './vitals.service';
import { VitalsController } from './vitals.controller';

@Module({
  controllers: [VitalsController],
  providers: [VitalsService],
  exports: [VitalsService],
})
export class VitalsModule {}
