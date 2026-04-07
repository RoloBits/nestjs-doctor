import { Injectable } from "@nestjs/common";

@Injectable()
export class FuseLogger {
	log(msg: string) {}

	setContext(ctx: string) {}
}
