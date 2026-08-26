import { Injectable } from "@nestjs/common";

@Injectable()
export class SearchIndexService {
	constructor(private readonly nodeUrl: string) {}

	ping(): string {
		return `up at ${this.nodeUrl}`;
	}
}
