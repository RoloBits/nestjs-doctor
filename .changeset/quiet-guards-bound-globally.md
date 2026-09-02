---
"nestjs-doctor": patch
---

### Fixed

`security/require-guards-on-endpoints` no longer reports every endpoint in an app that binds its guard with `app.useGlobalGuards()` in `main.ts`, and no longer reports a controller that inherits a guard from the base class it extends.

Scores rise on any project that binds its guard globally or inherits it: the rule fired once per handler at 2.25 points each, which makes this the largest score mover of the four fixes in this release.
