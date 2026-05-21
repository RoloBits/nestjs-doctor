import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { OrdersModule } from "./orders/orders.module";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [
		MikroOrmModule.forRoot({
			driver: "postgresql",
			dbName: "app",
			autoLoadEntities: true,
		}),
		UsersModule,
		OrdersModule,
	],
})
export class AppModule {}
