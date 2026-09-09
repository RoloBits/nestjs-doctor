import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { UsersRepository } from "./repo";

@Injectable()
export class ThrowsService {
	constructor(private readonly repo: UsersRepository) {}

	plain(id: string) {
		if (!id) {
			throw new NotFoundException("user missing");
		}
		return id;
	}

	caught(id: string) {
		try {
			this.repo.remove(id);
		} catch (err) {
			throw new BadRequestException("bad input");
		}
	}

	rethrow(id: string) {
		try {
			this.repo.remove(id);
		} catch (err) {
			throw err;
		}
	}

	async guarded(id: string) {
		const found = await this.repo.findOne(id);
		if (!found) {
			throw new NotFoundException("no user");
		}
		return found;
	}
}
