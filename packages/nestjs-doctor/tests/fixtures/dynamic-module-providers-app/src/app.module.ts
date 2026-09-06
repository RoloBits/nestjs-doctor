import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { CacheModule } from './cache/cache.module.js';
import { HttpModule } from './http/http.module.js';
import { makeLoggerModule } from './logger/make-logger-module.js';
import { MailConfig } from './mail/mail.config.js';
import { MailModule } from './mail/mail.module.js';

@Module({
  imports: [
    CacheModule.forRoot({ metrics: true }),
    makeLoggerModule(),
    HttpModule.forRoot({}),
    MailModule.forRootAsync({ useClass: MailConfig }),
  ],
  controllers: [AppController],
})
export class AppModule {}
