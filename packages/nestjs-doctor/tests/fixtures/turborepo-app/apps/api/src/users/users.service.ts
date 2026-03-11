import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
	findAll() {
		return [{ id: "1", name: "John", email: "john@example.com" }];
	}

	findOne(id: string) {
		return { id, name: "John", email: "john@example.com" };
	}
}
