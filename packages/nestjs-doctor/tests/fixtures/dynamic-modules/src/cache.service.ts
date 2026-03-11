import { Injectable } from "@nestjs/common";

@Injectable()
export class CacheService {
	get(key: string): string {
		return `cached-${key}`;
	}
}
