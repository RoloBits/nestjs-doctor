import { Injectable } from '@nestjs/common';

@Injectable()
export class OverloadService {
	render(value: string): string;
	render(value: number): string;
	render(value: string | number): string {
		return String(value);
	}
}
