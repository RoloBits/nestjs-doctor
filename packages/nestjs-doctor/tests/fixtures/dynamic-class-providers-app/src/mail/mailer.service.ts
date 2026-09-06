import { Injectable } from '@nestjs/common';

export const MAILER = Symbol('MAILER');
export const MAILER_ALIAS = Symbol('MAILER_ALIAS');

export interface Mailer {
  send(message: string): void;
}

@Injectable()
export class SmtpMailer implements Mailer {
  private readonly host = 'smtp.example.com';

  send(message: string): void {
    console.log(`smtp ${this.host}: ${message}`);
  }
}

@Injectable()
export class FakeMailer implements Mailer {
  readonly sent: string[] = [];

  send(message: string): void {
    this.sent.push(message);
  }
}
