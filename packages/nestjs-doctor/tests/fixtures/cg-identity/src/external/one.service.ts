import { Inject, Injectable } from '@nestjs/common';
import type { Client } from 'pkg-one';

@Injectable()
export class ExternalOneService {
	constructor(@Inject('CLIENT_ONE') private readonly client: Client) {}

	run(): void {
		this.client.send();
	}
}
