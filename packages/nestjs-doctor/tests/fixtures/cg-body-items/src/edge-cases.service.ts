import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./repo";

export function moduleHelper(value: string) {
	return value.trim();
}

@Injectable()
export class EdgeCasesService {
	constructor(private readonly repo: UsersRepository) {}

	moduleFn(id: string) {
		const out = moduleHelper(id);
		return out;
	}

	localFn(id: string) {
		function localHelper(value: string) {
			return value.trim();
		}
		const out = localHelper(id);
		return out;
	}

	overloaded(id: string): string;
	overloaded(id: number): string;
	overloaded(id: string | number): string {
		this.repo.remove(`${id}`);
		return `${id}`;
	}

	async loop(ids: string[]) {
		for (const id of ids) {
			await this.repo.remove(id);
		}
		return ids;
	}

	async interleaved(id: string) {
		const user = await this.repo.findOne(id);
		const label = id.trim();
		const saved = await this.repo.save(user);
		const suffix = label.concat("!");
		return { saved, suffix };
	}

	helperCall(id: string) {
		const clean = this.normalise(id);
		return clean;
	}

	normalise(id: string) {
		return id.trim();
	}
}
