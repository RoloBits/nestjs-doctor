import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { auditProviders } from './audit/audit.providers.js';
import { configProviders } from './config/config.providers.js';
import { UnregisteredService } from './legacy/unregistered.service.js';
import { mailerProviders } from './mail/mailer.providers.js';

function providerFactory() {
  UnregisteredService.describe();
  return AppService;
}

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    { provide: AppService, useClass: providerFactory() },
    ...mailerProviders,
    ...auditProviders,
    ...configProviders,
  ],
})
export class AppModule {}
