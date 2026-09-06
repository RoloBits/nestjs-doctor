import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheMetricsService {
  private hits = 0;

  hit(_key: string): void {
    this.hits += 1;
  }
}
