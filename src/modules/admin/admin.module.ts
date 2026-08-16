import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { StatsService } from './stats.service';
import { ReferentialsService } from './referentials.service';
import { AdminController, StatsController, ReferentialsController } from './admin.controller';

@Module({
  controllers: [AdminController, StatsController, ReferentialsController],
  providers: [AdminService, StatsService, ReferentialsService],
})
export class AdminModule {}