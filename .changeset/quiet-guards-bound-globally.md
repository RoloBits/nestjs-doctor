---
"nestjs-doctor": patch
---

### Fixed

`security/require-guards-on-endpoints` no longer reports every endpoint in an app that binds its guard with `app.useGlobalGuards()` in `main.ts`, and no longer reports a controller that inherits a guard from the base class it extends.
