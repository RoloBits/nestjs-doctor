import { Injectable } from '@nestjs/common';
import { QueueService } from './queue.service';

@Injectable()
export class DispatchService {
  constructor(private readonly queue: QueueService) {}

  run() {
    this.queue.enqueue('now');
  }
}
