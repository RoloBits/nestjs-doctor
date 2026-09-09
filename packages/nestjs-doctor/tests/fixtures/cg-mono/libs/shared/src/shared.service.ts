import { Injectable } from '@nestjs/common';
import { slugify } from './shared.utils';

@Injectable()
export class SharedService {
	format(value: string) {
		return slugify(value);
	}

	label(value: string) {
		return this.format(value);
	}
}
