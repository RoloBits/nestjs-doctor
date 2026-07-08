import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./user.entity";

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(User)
		private readonly usersRepository: Repository<User>
	) {}

	findAll() {
		return this.usersRepository.find();
	}

	findOne(id: string) {
		return this.usersRepository.findOne({ where: { id } });
	}
}
