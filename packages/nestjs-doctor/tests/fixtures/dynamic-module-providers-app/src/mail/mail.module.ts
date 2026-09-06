import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { MAIL_OPTIONS, type MailOptions, type MailOptionsFactory } from './mail.options.js';
import { MailService } from './mail.service.js';

export interface MailAsyncOptions {
  useClass: Type<MailOptionsFactory>;
}

@Module({ providers: [MailService] })
export class MailModule {
  static forRootAsync(options: MailAsyncOptions): DynamicModule {
    return {
      module: MailModule,
      providers: [
        {
          provide: MAIL_OPTIONS,
          useFactory: (factory: MailOptionsFactory): MailOptions => factory.createMailOptions(),
          inject: [options.useClass],
        },
        ...this.createAsyncProviders(options),
      ],
      exports: [MailService],
    };
  }

  private static createAsyncProviders(options: MailAsyncOptions): Provider[] {
    return [{ provide: options.useClass, useClass: options.useClass }];
  }
}
