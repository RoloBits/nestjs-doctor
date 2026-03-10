import { Injectable } from "@nestjs/common";

@Injectable()
export class PostsService {
	findOneById(id: string) {
		return { id, title: "Post" };
	}

	findAll() {
		return [{ id: "1", title: "Post" }];
	}

	create(title: string) {
		return { id: "2", title };
	}

	remove(id: string) {
		return { id, removed: true };
	}
}
