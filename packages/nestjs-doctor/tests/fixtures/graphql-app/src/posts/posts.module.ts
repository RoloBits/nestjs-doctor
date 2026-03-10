import { Module } from "@nestjs/common";
import { PostsAnalyticsService } from "./posts-analytics.service";
import { PostsResolver } from "./posts.resolver";
import { PostsService } from "./posts.service";

@Module({
	providers: [PostsResolver, PostsService, PostsAnalyticsService],
})
export class PostsModule {}
