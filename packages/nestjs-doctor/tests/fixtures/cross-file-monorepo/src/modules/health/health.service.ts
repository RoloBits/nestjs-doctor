import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
	check(): { status: string } {
		return { status: "ok" };
	}
}
