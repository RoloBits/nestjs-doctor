import { Injectable } from "@nestjs/common";
import type { UsersRepository } from "./users.repository";

@Injectable()
export class OrdersService {
	constructor(private readonly usersRepo: UsersRepository) {}

	findAll() {
		return this.usersRepo.findAll();
	}

	findById(id: string) {
		return this.usersRepo.findById(id);
	}

	save(data: any) {
		return this.usersRepo.save(data);
	}
}
