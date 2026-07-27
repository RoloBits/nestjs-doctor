import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OrdersController } from './orders.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  controllers: [OrdersController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
