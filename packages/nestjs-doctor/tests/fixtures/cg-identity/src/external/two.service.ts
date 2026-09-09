import { Inject, Injectable } from '@nestjs/common';
import type { Client } from 'pkg-two';

@Injectable()
export class ExternalTwoService {
	constructor(@Inject('CLIENT_TWO') private readonly client: Client) {}

	run(): void {
		this.client.send();
	}
}
