import { Injectable } from '@nestjs/common';

@Injectable()
export class DiamondD {
	sink(): number {
		return 4;
	}
}

@Injectable()
export class DiamondB {
	constructor(private readonly d: DiamondD) {}

	step(): number {
		return this.d.sink();
	}
}

@Injectable()
export class DiamondC {
	constructor(private readonly d: DiamondD) {}

	step(): number {
		return this.d.sink();
	}
}

@Injectable()
export class DiamondA {
	constructor(
		private readonly b: DiamondB,
		private readonly c: DiamondC
	) {}

	start(): number {
		this.b.step();
		return this.c.step();
	}
}
