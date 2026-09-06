import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AppService } from './app.service.js';
import { AuditService } from './audit/audit.service.js';
import { AUDIT } from './audit/audit.providers.js';
import { MAILER, MAILER_ALIAS, type Mailer } from './mail/mailer.service.js';
import { AuthGuard } from './auth.guard.js';

@Controller()
@UseGuards(AuthGuard)
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(MAILER_ALIAS) private readonly mailerAlias: Mailer,
    @Inject(AUDIT) private readonly audit: AuditService,
  ) {}

  @Get()
  getHello(): string {
    this.audit.record('hello');
    this.mailer.send('hello');
    this.mailerAlias.send('hello again');
    return this.appService.getHello();
  }
}
