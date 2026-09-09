import { Injectable } from '@nestjs/common';

@Injectable()
export class TargetService {
	hit(): number {
		return 1;
	}
}

@Injectable()
export class TwiceService {
	constructor(private readonly target: TargetService) {}

	run(): number {
		this.target.hit();
		return this.target.hit();
	}
}

@Injectable()
export class CycleB {
	constructor(private readonly a: CycleA) {}

	pong(): number {
		return this.a.ping();
	}
}

@Injectable()
export class CycleA {
	constructor(private readonly b: CycleB) {}

	ping(): number {
		return this.b.pong();
	}
}

@Injectable()
export class RecursiveService {
	countdown(n: number): number {
		if (n <= 0) {
			return 0;
		}
		return this.countdown(n - 1);
	}
}
