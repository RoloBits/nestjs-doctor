import { Injectable } from "@nestjs/common";

@Injectable()
export class LoggerService {
	log(message: string): void {
		process.stdout.write(`[LOG] ${message}\n`);
	}
}
