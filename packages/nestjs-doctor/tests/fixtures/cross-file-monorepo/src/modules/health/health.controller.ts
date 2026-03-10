import { Controller, Get } from "@nestjs/common";
import type { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
	constructor(private readonly healthService: HealthService) {}

	@Get()
	check() {
		return this.healthService.check();
	}
}
