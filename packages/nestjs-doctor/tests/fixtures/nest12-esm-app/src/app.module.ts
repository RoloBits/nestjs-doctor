import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module.js";
import { ObserveModule } from "./observe.js";
import { OrdersModule } from "./orders/orders.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [ObserveModule, CoreModule, UsersModule, OrdersModule],
})
export class AppModule {}
