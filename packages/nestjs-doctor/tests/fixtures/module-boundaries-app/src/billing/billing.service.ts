import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../orders/entities/order.entity';

@Injectable()
export class BillingService {
  describe(order: OrderEntity): string {
    return order.id;
  }
}
