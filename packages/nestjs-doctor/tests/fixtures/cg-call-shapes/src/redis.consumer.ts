import { Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";

@Injectable()
export class RedisConsumer {
	constructor(private readonly redis: Redis) {}

	ping(): unknown {
		return this.redis.ping();
	}
}
