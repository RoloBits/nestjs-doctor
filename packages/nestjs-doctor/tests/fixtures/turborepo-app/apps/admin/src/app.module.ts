import { Module } from "@nestjs/common";
import { DashboardModule } from "./dashboard/dashboard.module";

@Module({
	imports: [DashboardModule],
	controllers: [],
	providers: [],
})
export class AppModule {}
