---
"nestjs-doctor": patch
---

### Fixed

`security/require-guards-on-endpoints` no longer reports every endpoint in an app that binds its guard with `app.useGlobalGuards(guard)`, and no longer reports a controller that inherits a guard from the base class it extends. The call counts only with at least one argument and only on the HTTP app: a `NestFactory.create()` result, or a variable or parameter typed as a Nest application such as `INestApplication`. A guard bound on a microservice handle, or an empty `app.useGlobalGuards()`, leaves HTTP endpoints reported.

Scores rise on any project that binds its guard globally or inherits it: the rule fired once per handler at 2.25 points each, which makes this the largest score mover of the four fixes in this release.
