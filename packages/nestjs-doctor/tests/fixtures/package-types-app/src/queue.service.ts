import { Injectable } from '@nestjs/common';

@Injectable()
export class QueueService {
  async enqueue(job: string): Promise<void> {
    await Promise.resolve(job);
  }
}
