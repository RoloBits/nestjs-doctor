---
"nestjs-doctor": patch
---

`performance/no-orphan-modules` no longer reports a root module whose class is
not called `AppModule`.

The rule skips a module that `NestFactory.create()` bootstraps, and falls back
to the name `AppModule` for projects whose bootstrap sits outside the scan. The
fallback keys on the class name, so a root module named anything else was
reported as never imported:

- `ImmichAdminModule` in `immich`'s `src/app.module.ts`
- `ApplicationModule` in `Saluki/nestjs-template`'s `src/modules/app.module.ts`

A module declared in `app.module.ts`, `main.module.ts` or `root.module.ts` is now
treated as the root whatever the class is called. A module nobody imports under
any other filename is still reported.

Across 189 public projects this removes 4 findings and adds none.
