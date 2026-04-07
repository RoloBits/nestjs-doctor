import { Injectable } from "@nestjs/common";

@Injectable()
export class RecipesService {
	findAll() {
		return [];
	}

	create(title: string) {
		return { title };
	}
}
