import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module";
import { OrdersModule } from "./orders/orders.module";
import { ProductsModule } from "./products/products.module";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [DatabaseModule, UsersModule, ProductsModule, OrdersModule],
})
export class AppModule {}
