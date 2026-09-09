import { Injectable } from '@nestjs/common';

@Injectable()
export class Ops {
	fromBase(): string {
		return 'base';
	}
}
