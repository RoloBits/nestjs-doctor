import { Inject, Injectable } from "@nestjs/common";
import { CacheService } from "./cache.service";

@Injectable()
export class CacheConsumer {
	@Inject("CACHE_TOKEN")
	private readonly cache!: CacheService;

	read(): string {
		return this.cache.get("k");
	}
}
