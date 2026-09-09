import { Inject, Injectable } from '@nestjs/common';
import type { Mailer } from './mailer';

@Injectable()
export class MailerOneConsumer {
	constructor(@Inject('MAILER_ONE') private readonly mailer: Mailer) {}

	run(): void {
		this.mailer.send();
	}
}
