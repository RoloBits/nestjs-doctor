import { Injectable } from "@nestjs/common";

@Injectable()
export class PostsAnalyticsService {
	getStats(postId: string) {
		return { postId, views: 0, likes: 0 };
	}
}
