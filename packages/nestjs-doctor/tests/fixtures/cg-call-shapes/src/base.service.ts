import { Injectable } from "@nestjs/common";

@Injectable()
export class BaseService {
	inherited(): string {
		return "base-inherited";
	}

	overridden(): string {
		return "base-overridden";
	}
}
