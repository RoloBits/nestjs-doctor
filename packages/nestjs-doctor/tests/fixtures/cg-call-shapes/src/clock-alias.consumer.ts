import { Inject, Injectable } from "@nestjs/common";
import type { Clock as Timepiece } from "./clock-a";

@Injectable()
export class ClockAliasConsumer {
	constructor(@Inject("CLOCK_A") private readonly clock: Timepiece) {}

	tick(): number {
		return this.clock.now();
	}
}
