import { Injectable } from "@nestjs/common";

@Injectable()
export class Mailer {
	static send(to: string): string {
		return `static:${to}`;
	}

	send(to: string): string {
		return `instance:${to}`;
	}
}
