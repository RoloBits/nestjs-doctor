import { Module } from "@nestjs/common";
import { OrdersModule } from "./orders.module";
import { Service1 } from "./service1";
import { Service2 } from "./service2";
import { Service3 } from "./service3";
import { Service4 } from "./service4";
import { Service5 } from "./service5";
import { Service6 } from "./service6";
import { UsersModule } from "./users.module";

// BAD: AppModule declares too many providers directly instead of using feature modules
@Module({
	imports: [UsersModule, OrdersModule],
	providers: [Service1, Service2, Service3, Service4, Service5, Service6],
})
export class AppModule {}
