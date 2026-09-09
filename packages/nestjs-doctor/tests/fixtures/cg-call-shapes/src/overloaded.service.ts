import { Injectable } from "@nestjs/common";

@Injectable()
export class OverloadedService {
	find(id: string): string;
	find(id: number): string;
	find(id: string | number): string {
		return `${id}`;
	}
}
