import { Injectable } from "@nestjs/common";
import type { UsersRepository } from "./users.repository";

@Injectable()
export class BaseService {
	constructor(private readonly repo: UsersRepository) {}

	findAll() {
		return this.repo.find();
	}
}
