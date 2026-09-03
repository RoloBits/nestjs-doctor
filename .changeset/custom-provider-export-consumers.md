---
"nestjs-doctor": patch
---

Stop `performance/no-unused-module-exports` flagging an export consumed only through an object-literal provider: `{ provide: 'MAILER', useExisting: MailService }` or `useClass` in a module importing `MailModule` now counts `MailService` as used.
