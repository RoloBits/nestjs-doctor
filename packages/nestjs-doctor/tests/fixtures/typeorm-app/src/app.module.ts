import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrdersModule } from "./orders/orders.module";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [
		TypeOrmModule.forRoot({
			type: "postgres",
			database: "app",
			autoLoadEntities: true,
			synchronize: false,
		}),
		UsersModule,
		OrdersModule,
	],
})
export class AppModule {}
