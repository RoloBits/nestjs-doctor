import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import type { RecipesService } from "./recipes.service";

@Resolver()
export class RecipesResolver {
	constructor(private readonly recipesService: RecipesService) {}

	@Query()
	recipes() {
		return this.recipesService.findAll();
	}

	@Mutation()
	addRecipe(@Args("title") title: string) {
		return this.recipesService.create(title);
	}
}
