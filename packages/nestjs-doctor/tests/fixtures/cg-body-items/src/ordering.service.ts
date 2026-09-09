import { Injectable, NotFoundException } from "@nestjs/common";
import { OtherRepository, UsersRepository } from "./repo";

@Injectable()
export class OrderingService {
	constructor(
		private readonly repo: UsersRepository,
		private readonly other: OtherRepository
	) {}

	nestedArg(id: string) {
		return this.repo.save(this.repo.findOne(id));
	}

	sameLine(id: string) {
		this.repo.remove(id); this.other.ping(id);
	}

	multiLine(id: string) {
		this.repo.save({
			id,
			name: id,
		});
		this.other.ping(id);
	}

	async full(id: string) {
		const user = await this.repo.findOne(id);
		if (!user) {
			return null;
		}
		if (id === "x") {
			throw new NotFoundException("blocked");
		}
		const saved = await this.repo.save(user);
		return saved;
	}
}
