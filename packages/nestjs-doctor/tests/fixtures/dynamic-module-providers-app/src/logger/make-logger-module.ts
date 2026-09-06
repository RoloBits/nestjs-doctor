import { type DynamicModule } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { LoggerService } from './logger.service.js';

export function makeLoggerModule(): DynamicModule {
  return {
    module: LoggerModule,
    providers: [LoggerService],
    exports: [LoggerService],
  };
}
