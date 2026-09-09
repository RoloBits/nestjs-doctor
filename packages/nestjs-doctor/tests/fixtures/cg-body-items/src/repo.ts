import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersRepository {
	findOne(id: string) {
		return { id };
	}

	save(user: unknown) {
		return user;
	}

	remove(id: string) {
		return id;
	}
}

@Injectable()
export class OtherRepository {
	ping(id: string) {
		return id;
	}
}
