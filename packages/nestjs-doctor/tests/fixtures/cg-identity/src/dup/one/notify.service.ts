import { Injectable } from '@nestjs/common';

@Injectable()
export class NotifyService {
	send(): string {
		return 'one';
	}
}
