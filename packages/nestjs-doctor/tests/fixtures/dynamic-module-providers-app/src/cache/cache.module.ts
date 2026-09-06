import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { CacheMetricsService } from './cache-metrics.service.js';
import { CacheService } from './cache.service.js';

export interface CacheOptions {
  metrics?: boolean;
}

@Module({})
export class CacheModule {
  static forRoot(options: CacheOptions = {}): DynamicModule {
    const providers: Provider[] = [CacheService];
    if (options.metrics) {
      providers.push(CacheMetricsService);
    }
    return { module: CacheModule, providers, exports: [CacheService] };
  }
}
