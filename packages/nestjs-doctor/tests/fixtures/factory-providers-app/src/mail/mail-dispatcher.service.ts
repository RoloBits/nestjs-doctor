import { Inject, Injectable } from "@nestjs/common";
import { MAILER_TOKEN, mailerProvider } from "./mailer.providers";
import { MailerService } from "./mailer.service";

@Injectable()
export class MailDispatcherService {
	constructor(
		@Inject(MAILER_TOKEN) private readonly mailer: MailerService,
	) {}

	dispatch(to: string): string {
		return this.mailer.send(to, "hello");
	}
}

export const mailProviders = [mailerProvider, MailDispatcherService];
