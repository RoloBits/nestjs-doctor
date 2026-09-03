---
"nestjs-doctor": patch
---

Stop `security/require-guards-on-endpoints` reporting every endpoint in an app that binds its guard with `app.useGlobalGuards(guard)` on a `NestFactory.create()` result or an `INestApplication`-typed variable, or a controller inheriting a guard from its base class; an empty call or one on a microservice handle still leaves endpoints reported. At 2.25 points per handler this is the largest score mover in the release.
