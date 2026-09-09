import { Injectable } from "@nestjs/common";

@Injectable()
export class Store {
	save(): string {
		return "a";
	}
}
