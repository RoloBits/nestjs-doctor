import { Injectable } from '@nestjs/common';
import { CacheMetricsService } from './cache-metrics.service.js';

@Injectable()
export class CacheService {
  private readonly store = new Map<string, string>();

  constructor(private readonly metrics: CacheMetricsService) {}

  get(key: string): string {
    this.metrics.hit(key);
    return this.store.get(key) ?? `cached-${key}`;
  }
}
