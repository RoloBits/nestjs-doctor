import { InjectEntityManager } from "@mikro-orm/nestjs";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
	constructor(
		@InjectEntityManager()
		private readonly em: EntityManager
	) {}

	findAll() {
		return [];
	}

	findOne(id: number) {
		return { id };
	}
}
