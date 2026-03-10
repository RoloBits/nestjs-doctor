import { Module } from "@nestjs/common";
import { PostsModule } from "./posts/posts.module";
import { RecipesModule } from "./recipes/recipes.module";

@Module({
	imports: [RecipesModule, PostsModule],
})
export class AppModule {}
