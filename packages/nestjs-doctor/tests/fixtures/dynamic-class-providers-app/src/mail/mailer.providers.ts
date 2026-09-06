import type { Provider } from '@nestjs/common';
import { FakeMailer, MAILER, MAILER_ALIAS, SmtpMailer } from './mailer.service.js';

function pickMailer() {
  return MAILER;
}

export const mailerProviders: Provider[] = [
  {
    provide: MAILER,
    useClass: process.env.NODE_ENV === 'test' ? FakeMailer : SmtpMailer,
  },
  { provide: MAILER_ALIAS, useExisting: pickMailer() },
];
