import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { PostsAnalyticsService } from "./posts-analytics.service";
import { PostsService } from "./posts.service";

@Resolver("Post")
export class PostsResolver {
	constructor(
		private readonly postsService: PostsService,
		private readonly analyticsService: PostsAnalyticsService,
	) {}

	@Query()
	post(@Args("id") id: string) {
		return this.postsService.findOneById(id);
	}

	@Query()
	posts() {
		return this.postsService.findAll();
	}

	@Mutation()
	createPost(@Args("title") title: string) {
		return this.postsService.create(title);
	}

	@Mutation()
	removePost(@Args("id") id: string) {
		return this.postsService.remove(id);
	}

	@Query()
	postStats(@Args("id") id: string) {
		return this.analyticsService.getStats(id);
	}
}
