import { Injectable, LoggerService as NestLoggerService } from "@nestjs/common";

@Injectable()
export class LoggerService implements NestLoggerService {
	log(message: string) {
		return message;
	}

	error(message: string) {
		return message;
	}

	warn(message: string) {
		return message;
	}
}
