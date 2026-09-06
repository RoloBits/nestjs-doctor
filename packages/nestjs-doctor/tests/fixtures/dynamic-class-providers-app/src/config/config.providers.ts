import type { Provider } from '@nestjs/common';
import { ConfigService } from './config.service.js';

export const DATABASE_URL = 'DATABASE_URL';

export const configProviders: Provider[] = [
  ConfigService,
  {
    provide: DATABASE_URL,
    useFactory: (config: ConfigService) => config.get('DATABASE_URL'),
    inject: [ConfigService],
  },
];
