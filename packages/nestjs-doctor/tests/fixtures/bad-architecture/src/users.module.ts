import { Module } from "@nestjs/common";
import { OrdersModule } from "./orders.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

// BAD: circular dep — UsersModule imports OrdersModule, OrdersModule imports UsersModule
@Module({
	imports: [OrdersModule],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule {}
