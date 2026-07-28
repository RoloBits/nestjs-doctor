import { Module } from '@nestjs/common';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [OrdersModule],
})
export class AppModule {}
