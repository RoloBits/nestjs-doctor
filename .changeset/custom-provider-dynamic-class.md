---
"nestjs-doctor": patch
---

`correctness/injectable-must-be-provided` no longer reports a class whose registration is an expression rather than a bare name.

`useClass: providerFactory()`, `useClass: isProd ? SmtpMailer : FakeMailer`, `useClass: registry.mailer`, `useExisting: pick()` and `useClass: withLogging(AppService)` were all reported as unregistered, because the checker compared the source text of the value against class names. A class used as the `provide` token was reported too, because the token was never read. It now follows the value through functions, variables and object properties, across files, and counts every class it reaches. The same resolution feeds `performance/no-unused-providers` and `performance/no-unused-module-exports`.

Only a class the value can evaluate to counts. A class a helper merely calls or reads on the way, or one that appears in a factory's parameter type, a return type or a generic argument, is still reported when nothing registers it. A value the checker cannot resolve, such as `(config as any).Impl`, registers nothing.
