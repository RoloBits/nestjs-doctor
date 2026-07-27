import { Module } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { OrdersController } from "./orders/orders.controller";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";

@Module({
  providers: [AuthGuard, UsersService],
  controllers: [OrdersController, UsersController],
})
export class AppModule {}
