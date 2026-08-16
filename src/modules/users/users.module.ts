import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SmsService } from '../../common/services/sms.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, SmsService],
  exports: [UsersService],
})
export class UsersModule {}