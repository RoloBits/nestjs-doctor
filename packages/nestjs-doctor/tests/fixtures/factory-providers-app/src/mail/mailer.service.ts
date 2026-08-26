import { Injectable } from "@nestjs/common";
import type { SmtpOptions } from "../config/app-config.service";

@Injectable()
export class MailerService {
	constructor(
		private readonly transport: SmtpOptions,
		private readonly defaults: { from: string },
	) {}

	send(to: string, body: string): string {
		return `${this.defaults.from} -> ${to}: ${body} via ${this.transport.host}`;
	}
}
