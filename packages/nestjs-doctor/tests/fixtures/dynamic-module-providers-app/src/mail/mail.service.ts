import { Inject, Injectable } from '@nestjs/common';
import { MAIL_OPTIONS, type MailOptions } from './mail.options.js';

@Injectable()
export class MailService {
  constructor(@Inject(MAIL_OPTIONS) private readonly options: MailOptions) {}

  send(message: string): void {
    console.log(`from ${this.options.from}: ${message}`);
  }
}
