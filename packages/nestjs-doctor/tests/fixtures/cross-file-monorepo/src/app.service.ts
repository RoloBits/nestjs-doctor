import { Injectable } from "@nestjs/common";
import type { ConfigService } from "./modules/config/config.service";
import type { DatabaseService } from "./modules/database/database.service";
import type { LoggerService } from "./modules/logger/logger.service";
import type { QueueService } from "./modules/queue/queue.service";

@Injectable()
export class AppService {
	constructor(
		private readonly configService: ConfigService,
		private readonly loggerService: LoggerService,
		private readonly databaseService: DatabaseService,
		private readonly queueService: QueueService
	) {}

	getStatus(): { service: string; status: string } {
		return {
			service: this.configService.get("serviceName"),
			status: "running",
		};
	}
}
