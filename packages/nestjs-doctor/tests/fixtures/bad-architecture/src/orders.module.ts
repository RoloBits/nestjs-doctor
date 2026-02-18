import { Module } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { UsersModule } from "./users.module";

// BAD: circular dep — OrdersModule imports UsersModule
@Module({
	imports: [UsersModule],
	providers: [OrdersService],
	exports: [OrdersService],
})
export class OrdersModule {}
