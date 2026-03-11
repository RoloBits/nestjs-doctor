import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { CacheService } from "./cache.service";

@Module({
	providers: [CacheService],
	exports: [CacheService],
})
export class CacheModule {
	static forRootAsync(_options?: Record<string, unknown>): DynamicModule {
		return {
			module: CacheModule,
			providers: [CacheService],
			exports: [CacheService],
		};
	}
}
