---
"nestjs-doctor": patch
---

Stop `security/require-guards-on-endpoints` reporting guarded endpoints.

The rule looked for a literal `@UseGuards()` on the controller class or the
route method, so two mainstream NestJS auth patterns read as no guard at all:

- **Global guards.** `{ provide: APP_GUARD, useClass: JwtAuthGuard }` in a
  module's `providers` binds a guard application-wide. Every endpoint in the
  application was still reported.
- **Composed decorators.** A custom `@Auth()` built from
  `applyDecorators(UseGuards(...))` was invisible, so a codebase that wraps its
  guards — and therefore never writes `@UseGuards` directly — was reported in
  full.

Measured against three public repositories: `buqiyuan/nest-admin` drops from 72
findings to 0, `NarHakobyan/awesome-nest-boilerplate` from 12 to the 5 endpoints
that genuinely carry no guard, and `brocoders/nestjs-boilerplate` stays at 11,
which are real.

The rule only stays quiet on a positive sighting. If no module is visible — a
scan pointed at a subdirectory, or a config that excludes the root module — it
reports exactly as before rather than assuming a guard it cannot see. An
`APP_GUARD` reached through an aliased import is still not recognised, since
detection matches on the name as written.

Module nodes now carry `providerRegistrations`, the object-literal entries of
`providers` parsed into `{ token, useClass, useExisting }`. `providers` is
unchanged.
