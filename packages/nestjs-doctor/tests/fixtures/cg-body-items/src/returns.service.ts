import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./repo";

@Injectable()
export class ReturnsService {
	constructor(private readonly repo: UsersRepository) {}

	earlyNull(id: string) {
		if (!id) {
			return null;
		}
		return id;
	}

	bare(id: string): void {
		if (!id) {
			return;
		}
	}

	noReturn(id: string) {
		this.repo.remove(id);
	}

	nested(ids: string[]) {
		const mapped = ids.map((id) => {
			return id.trim();
		});
		return mapped;
	}

	branches(id: string) {
		if (id === "a") {
			return "a";
		}
		if (id === "b") {
			return "b";
		}
		return "c";
	}

	async awaited(id: string) {
		return await this.repo.findOne(id);
	}
}
