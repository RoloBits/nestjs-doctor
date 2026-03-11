import { Controller, Get } from "@nestjs/common";
import type { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
	constructor(private readonly dashboardService: DashboardService) {}

	@Get()
	getStats() {
		return this.dashboardService.getStats();
	}
}
