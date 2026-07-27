import { Module } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { OrdersController } from "./orders/orders.controller";
import { OrdersService } from "./orders/orders.service";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";

@Module({
  providers: [AuthGuard, OrdersService, UsersService],
  controllers: [OrdersController, UsersController],
})
export class AppModule {}
