import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { PaymentService } from '../../common/services/payment.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, PaymentService],
  exports: [InvoicesService, PaymentService],
})
export class InvoicesModule {}
