import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersRepository {
	findAll() {
		return [];
	}

	findById(id: string) {
		return { id };
	}

	save(data: any) {
		return data;
	}

	find() {
		return [];
	}

	findSpecial() {
		return [];
	}

	createQueryBuilder(alias: string) {
		return this;
	}
}
