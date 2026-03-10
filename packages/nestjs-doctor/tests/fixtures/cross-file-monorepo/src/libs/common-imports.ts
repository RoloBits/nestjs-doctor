import { ConfigModule } from "../modules/config/config.module";
import { HealthModule } from "../modules/health/health.module";
import { LoggerModule } from "../modules/logger/logger.module";

export function getAppCommonImports(_options?: { serviceName?: string }) {
	return [ConfigModule.forRoot({ isGlobal: true }), LoggerModule, HealthModule];
}
