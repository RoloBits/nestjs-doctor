import { Injectable } from '@nestjs/common';

@Injectable()
export class SharedService {
	audit(actor: string, count = 1): string {
		return `${actor}:${count}`;
	}

	other(): number {
		return 1;
	}
}
