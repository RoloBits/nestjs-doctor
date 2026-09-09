import { Inject, Injectable } from '@nestjs/common';
import type { Mailer } from './mailer';

@Injectable()
export class MailerTwoConsumer {
	constructor(@Inject('MAILER_TWO') private readonly mailer: Mailer) {}

	run(): void {
		this.mailer.send();
	}
}
