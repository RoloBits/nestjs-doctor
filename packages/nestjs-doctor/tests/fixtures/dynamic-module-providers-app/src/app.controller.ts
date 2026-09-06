import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { CacheService } from './cache/cache.service.js';
import { HttpService } from './http/http.service.js';
import { LoggerService } from './logger/logger.service.js';
import { MailService } from './mail/mail.service.js';

@Controller()
@UseGuards(AuthGuard)
export class AppController {
  constructor(
    private readonly cache: CacheService,
    private readonly logger: LoggerService,
    private readonly http: HttpService,
    private readonly mail: MailService,
  ) {}

  @Get()
  getHello(): string {
    this.logger.log('hello');
    this.mail.send('hello');
    return `${this.cache.get('greeting')} ${this.http.baseUrl()}`;
  }
}
