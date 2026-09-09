import { Injectable, NotFoundException } from "@nestjs/common";
import { UsersRepository } from "./repo";

@Injectable()
export class GuardsService {
	constructor(private readonly repo: UsersRepository) {}

	sameLine(id: string) {
		const trimmed = id.trim(); this.repo.remove(trimmed);
		return trimmed;
	}

	viaHelper(id: string) {
		const clean = this.normalise(id);
		if (!clean) {
			throw new NotFoundException("blank id");
		}
		return clean;
	}

	normalise(id: string) {
		return id.trim();
	}

	finallyReturn(id: string) {
		try {
			return this.repo.remove(id);
		} finally {
			this.repo.remove(id);
		}
	}

	async concurrent(ids: string[]) {
		const all = await Promise.all(
			ids.map((id) => this.repo.findOne(id))
		);
		return all;
	}
}
