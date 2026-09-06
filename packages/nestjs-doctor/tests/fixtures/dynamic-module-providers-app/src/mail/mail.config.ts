import { Injectable } from '@nestjs/common';
import type { MailOptions, MailOptionsFactory } from './mail.options.js';

@Injectable()
export class MailConfig implements MailOptionsFactory {
  createMailOptions(): MailOptions {
    return { from: 'noreply@example.com' };
  }
}
