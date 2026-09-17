import { Module } from '@nestjs/common';
import { EmailVerificationService } from '../../common/services/email-verification.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, EmailVerificationService],
  exports: [UsersService],
})
export class UsersModule {}