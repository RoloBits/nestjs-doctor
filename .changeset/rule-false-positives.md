---
"nestjs-doctor": patch
---

Stop three rules reporting working NestJS code, all found by scanning public
repositories.

`correctness/no-missing-injectable` flagged CQRS handlers and queue processors.
The rule modelled a list of decorators that "imply @Injectable", which is not
how NestJS works: the injector reads `design:paramtypes`, and TypeScript emits
that for a class carrying any class-level decorator. The rule now asks that
question instead of consulting a list, so `@CommandHandler`, `@Processor` and
every third-party or project decorator work without being enumerated. A
provider with constructor parameters and no class decorator — the shape that
actually fails at boot — still reports, and so does one whose only decorator is
on a method.

`architecture/no-manual-instantiation` flagged `new HeaderResolver(['x-lang'])`
inside `I18nModule.forRootAsync(...)`. A `new` inside a decorator argument is
configuration; `useValue: new X()` is documented NestJS. The skip that already
covered guards and interceptors now covers every suffix.

`security/no-hardcoded-secrets` flagged message keys and permission constants:
`throw new UnprocessableEntityException({ errors: { password: 'incorrectPassword' } })`,
`PASSWORD_UPDATE: 'password:update'`, and `SYS_USER_INITPASSWORD = 'sys_user_initPassword'`.
Three narrow skips on the name-based path: a string handed to `throw`, a
lowercase colon-separated scope, and a value that only restates its own name. A
credential never matches any of the three; `correct-horse-battery-staple` and
`super-secret-key` under a `password` property still report, and the
pattern-based detection is untouched.

Twelve false errors removed across the three repositories.
