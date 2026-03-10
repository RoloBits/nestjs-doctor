import { Injectable } from "@nestjs/common";

@Injectable()
export class DatabaseService {
	query(sql: string): unknown[] {
		return [{ sql }];
	}
}
