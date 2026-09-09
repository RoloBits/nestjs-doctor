import { Injectable } from '@nestjs/common';
import { NotifyService } from './notify.service';

@Injectable()
export class DupTwoCaller {
	constructor(private readonly notify: NotifyService) {}

	run(): string {
		return this.notify.send();
	}
}
