import { Injectable } from '@nestjs/common';
import { OverrideBase } from './override-base';

@Injectable()
export class OverrideChild extends OverrideBase {
	label(): string {
		const base = super.label();
		return `${base}-child`;
	}

	use(): string {
		return this.label();
	}
}
