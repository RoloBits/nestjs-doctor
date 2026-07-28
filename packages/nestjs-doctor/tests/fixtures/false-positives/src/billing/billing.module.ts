import { Module } from '@nestjs/common';
import { HeaderResolver, I18nModule } from 'nestjs-i18n';
import { AuthGuard } from './auth.guard';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CreateInvoiceHandler } from './create-invoice.handler';
import { InvoiceRepository } from './invoice.repository';

@Module({
  imports: [
    I18nModule.forRootAsync({
      resolvers: [new HeaderResolver(['x-lang'])],
    }),
  ],
  controllers: [BillingController],
  providers: [AuthGuard, BillingService, CreateInvoiceHandler, InvoiceRepository],
})
export class BillingModule {}
