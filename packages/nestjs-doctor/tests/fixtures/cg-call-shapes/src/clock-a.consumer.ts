import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "./clock-a";

@Injectable()
export class ClockAConsumer {
	constructor(@Inject("CLOCK_A") private readonly clock: Clock) {}

	tick(): number {
		return this.clock.now();
	}
}
