import { Injectable } from "@nestjs/common";
import { Greeter, makeLabel } from "./helpers";

@Injectable()
export class ChainService {
	chained(): string {
		return makeLabel().render();
	}

	constructed(): string {
		return new Greeter().greet();
	}

	builtins(): string {
		const values = [3, 1, 2];
		const sorted = values.slice().sort();
		return JSON.stringify(sorted) + String(Math.max(...values));
	}

	mapped(): string[] {
		const ids = ["a", "b"];
		return ids.map((id) => this.decorate(id));
	}

	deferred(): void {
		setTimeout(() => this.decorate("later"), 0);
	}

	decorate(id: string): string {
		return id.toUpperCase();
	}
}
