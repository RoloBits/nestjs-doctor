import { Inject, Injectable } from '@nestjs/common';
import type * as pkgTwo from 'pkg-two';

@Injectable()
export class TwoService {
	constructor(@Inject('C2') private readonly client: pkgTwo.Client) {}

	run() {
		this.client.send('two');
	}
}
