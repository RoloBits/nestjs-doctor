import { Inject, Injectable } from '@nestjs/common';
import { HttpMetricsService } from './http-metrics.service.js';
import { type HttpModuleOptions, MODULE_OPTIONS_TOKEN } from './http.module-definition.js';

@Injectable()
export class HttpService {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private readonly options: HttpModuleOptions,
    private readonly metrics: HttpMetricsService,
  ) {}

  baseUrl(): string {
    this.metrics.request();
    return this.options.baseUrl ?? 'http://localhost';
  }
}
