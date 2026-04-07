import { Injectable } from "@nestjs/common";

@Injectable()
export class EventEmitter2 {
	emit(event: string, data?: any) {}
}
