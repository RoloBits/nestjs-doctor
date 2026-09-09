import { Injectable } from '@nestjs/common';

@Injectable()
export class Ops {
	label() {
		return 'base';
	}
}
