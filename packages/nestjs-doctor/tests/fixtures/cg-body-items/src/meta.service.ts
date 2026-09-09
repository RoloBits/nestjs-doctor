import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./repo";

@Injectable()
export class MetaService {
	constructor(private readonly repo: UsersRepository) {}

	async annotated(id: string) {
		// load the user first
		const user = await this.repo.findOne(id);
		const { id: found } = await this.repo.save(user);
		return found;
	}
}
