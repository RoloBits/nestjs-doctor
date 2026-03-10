import {
	Args,
	Mutation,
	Parent,
	Query,
	ResolveField,
	Resolver,
} from "@nestjs/graphql";
import { RecipesService } from "./recipes.service";

class Recipe {
	id!: string;
	title!: string;
	description!: string;
}

@Resolver(() => Recipe)
export class RecipesResolver {
	constructor(private readonly recipesService: RecipesService) {}

	@Query()
	recipe(@Args("id") id: string) {
		return this.recipesService.findOneById(id);
	}

	@Query()
	recipes() {
		return this.recipesService.findAll();
	}

	@Mutation()
	addRecipe(@Args("title") title: string) {
		return this.recipesService.create(title);
	}

	@Mutation()
	removeRecipe(@Args("id") id: string) {
		return this.recipesService.remove(id);
	}

	@ResolveField()
	description(@Parent() recipe: Recipe) {
		return `A description for ${recipe.title}`;
	}
}
