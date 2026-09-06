import { Injectable } from '@nestjs/common';

@Injectable()
export class StripeGateway {
  charge(amount: number): string {
    return `stripe:${amount}`;
  }
}
