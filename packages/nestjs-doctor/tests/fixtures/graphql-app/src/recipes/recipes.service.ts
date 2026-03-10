import { Injectable } from "@nestjs/common";

@Injectable()
export class RecipesService {
	findOneById(id: string) {
		return { id, title: "Recipe" };
	}

	findAll() {
		return [{ id: "1", title: "Recipe" }];
	}

	create(title: string) {
		return { id: "2", title };
	}

	remove(id: string) {
		return true;
	}
}
