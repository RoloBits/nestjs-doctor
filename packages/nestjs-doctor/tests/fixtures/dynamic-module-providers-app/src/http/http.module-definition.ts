import { ConfigurableModuleBuilder } from '@nestjs/common';
import { HttpMetricsService } from './http-metrics.service.js';

export interface HttpModuleOptions {
  baseUrl?: string;
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<HttpModuleOptions>()
    .setClassMethodName('forRoot')
    .setExtras({ isGlobal: false }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
      providers: [...(definition.providers ?? []), HttpMetricsService],
    }))
    .build();
