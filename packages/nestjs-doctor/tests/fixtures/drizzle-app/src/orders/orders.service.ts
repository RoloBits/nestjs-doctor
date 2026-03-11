import { Injectable } from "@nestjs/common";
import type { DatabaseService } from "../database/database.service";

@Injectable()
export class OrdersService {
	constructor(private readonly db: DatabaseService) {}

	findAll() {
		return [];
	}

	findOne(id: string) {
		return { id };
	}
}
