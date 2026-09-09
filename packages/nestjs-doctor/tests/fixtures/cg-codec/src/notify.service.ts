import { Injectable } from '@nestjs/common';

@Injectable()
export class NotifyService {
	send(to: string) {
		return to;
	}
}
