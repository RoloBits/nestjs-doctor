import { Injectable } from '@nestjs/common';
import { NotifyService } from './notify.service';

@Injectable()
export class ChainService {
	constructor(private readonly notify: NotifyService) {}

	quad(n: number) {
		if (n === 1) {
			this.notify.one();
		} else if (n === 2) {
			this.notify.two();
		} else if (n === 3) {
			this.notify.three();
		} else {
			this.notify.four();
		}
	}
}
