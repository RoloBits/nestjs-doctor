import { Inject, Injectable } from "@nestjs/common";
import type * as ClockA from "./clock-a";
import type * as ClockB from "./clock-b";

@Injectable()
export class ClockPairConsumer {
	constructor(
		@Inject("CLOCK_A") private readonly first: ClockA.Clock,
		@Inject("CLOCK_B") private readonly second: ClockB.Clock
	) {}

	tickBoth(): number {
		return this.first.now() + this.second.now();
	}
}
