import { Inject, Injectable } from '@nestjs/common';
import type * as pkgOne from './pkg-one';

@Injectable()
export class OneService {
	constructor(@Inject('C1') private readonly client: pkgOne.Client) {}

	run() {
		this.client.send('one');
	}
}
