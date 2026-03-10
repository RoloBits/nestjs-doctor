import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { getServiceAppCommonImports } from "./libs/app-shared";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { QueueModule } from "./modules/queue/queue.module";

const SERVICE_NAME = "admin-api";

@Module({
	imports: getServiceAppCommonImports({ serviceName: SERVICE_NAME }).concat([
		AdminAuthModule,
		QueueModule,
	]),
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
