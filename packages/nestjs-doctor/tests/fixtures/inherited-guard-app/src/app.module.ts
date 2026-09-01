import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';

@Module({
  controllers: [OrdersController],
})
export class AppModule {}
