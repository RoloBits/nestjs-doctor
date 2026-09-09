import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenService {
	static format(value: string): string {
		return value.trim();
	}

	format(value: string): string {
		return value.toUpperCase();
	}
}

@Injectable()
export class TokenCaller {
	constructor(private readonly token: TokenService) {}

	run(value: string): string {
		const viaClass = TokenService.format(value);
		return this.token.format(viaClass);
	}
}
