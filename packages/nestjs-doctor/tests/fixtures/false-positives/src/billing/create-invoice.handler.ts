import { CommandHandler } from '@nestjs/cqrs';
import { BillingService } from './billing.service';

export class CreateInvoiceCommand {}

@CommandHandler(CreateInvoiceCommand)
export class CreateInvoiceHandler {
  constructor(private readonly billing: BillingService) {}

  execute(): string[] {
    return this.billing.list();
  }
}
