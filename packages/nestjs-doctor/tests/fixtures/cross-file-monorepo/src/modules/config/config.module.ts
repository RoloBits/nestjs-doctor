import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { ConfigService } from "./config.service";

@Module({
	providers: [ConfigService],
	exports: [ConfigService],
})
export class ConfigModule {
	static forRoot(_options?: Record<string, unknown>): DynamicModule {
		return {
			module: ConfigModule,
			providers: [ConfigService],
			exports: [ConfigService],
		};
	}
}
