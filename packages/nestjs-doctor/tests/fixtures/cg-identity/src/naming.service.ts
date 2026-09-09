import { Injectable } from '@nestjs/common';
import { normalize } from './helpers';

@Injectable()
export class NamingService {
	normalize(value: string): string {
		return value.toUpperCase();
	}
}

@Injectable()
export class NamingCaller {
	constructor(private readonly naming: NamingService) {}

	run(value: string): string {
		const free = normalize(value);
		return this.naming.normalize(free);
	}
}
