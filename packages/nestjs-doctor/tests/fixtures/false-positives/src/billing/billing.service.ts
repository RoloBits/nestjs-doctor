import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InvoiceRepository } from './invoice.repository';

@Injectable()
export class BillingService {
  constructor(private readonly invoices: InvoiceRepository) {}

  verify(password: string): void {
    if (!password) {
      throw new UnprocessableEntityException({
        errors: { password: 'incorrectPassword' },
      });
    }
  }

  list(): string[] {
    return this.invoices.all();
  }
}
