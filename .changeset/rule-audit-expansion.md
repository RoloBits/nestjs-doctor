---
"nestjs-doctor": patch
---

Rule audit and expansion: removed 5 noisy rules, added 5 new high-value rules

**Removed** (high false-positive rate or too opinionated):
- `no-god-service` — arbitrary thresholds for method/dependency counts
- `require-feature-modules` — too opinionated for small apps
- `no-unnecessary-async` — overlapped with `no-async-without-await`
- `require-auth-guard` — flagged public endpoints, health checks, webhooks
- `require-validation-pipe` — couldn't detect global ValidationPipe setup

**Added:**
- `no-synchronize-in-production` (security/error) — flags `synchronize: true` in TypeORM config
- `no-service-locator` (architecture/warning) — flags `ModuleRef.get()`/`resolve()` usage
- `no-request-scope-abuse` (performance/warning) — flags `Scope.REQUEST` usage
- `no-raw-entity-in-response` (security/warning) — flags ORM entities returned from controllers
- `no-fire-and-forget-async` (correctness/warning) — flags unawaited async calls in service methods

Also removed the `thresholds` config option (`godServiceMethods`/`godServiceDeps`) and updated README examples to use `npm` instead of `pnpm`.
