import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./repo";

@Injectable()
export class StepsService {
	constructor(private readonly repo: UsersRepository) {}

	async mix(id: string) {
		const user = await this.repo.findOne(id);
		const name = id.trim();
		const key = name.concat("-key");
		const saved = await this.repo.save(user);
		return { key, saved };
	}
}
