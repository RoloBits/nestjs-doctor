import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "./clock-b";

@Injectable()
export class ClockBConsumer {
	constructor(@Inject("CLOCK_B") private readonly clock: Clock) {}

	tick(): number {
		return this.clock.now();
	}
}
