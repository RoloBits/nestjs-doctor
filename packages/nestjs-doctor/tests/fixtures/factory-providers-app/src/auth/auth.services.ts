import { Injectable } from "@nestjs/common";

@Injectable()
export class TokenSignerService {
	constructor(private readonly secret: string) {}

	sign(payload: object): string {
		return `${JSON.stringify(payload).length}.${this.secret.length}`;
	}
}

@Injectable()
export class KeyStoreService {
	constructor(private readonly url: string) {}

	load(kid: string): string {
		return `${this.url}/${kid}`;
	}
}
