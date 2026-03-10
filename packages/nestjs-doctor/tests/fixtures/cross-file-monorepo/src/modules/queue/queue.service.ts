import { Injectable } from "@nestjs/common";

@Injectable()
export class QueueService {
	enqueue(job: string): { queued: boolean } {
		return { queued: job.length > 0 };
	}
}
