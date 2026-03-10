import { Injectable } from "@nestjs/common";

@Injectable()
export class ConfigService {
	get(key: string): string {
		return `config-${key}`;
	}
}
