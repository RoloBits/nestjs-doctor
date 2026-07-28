import { Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [BillingModule],
})
export class AppModule {}
