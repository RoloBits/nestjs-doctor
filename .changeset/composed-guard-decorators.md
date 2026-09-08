---
"nestjs-doctor": patch
---

A decorator that composes `UseGuards` now counts as a guard even when it returns the call directly instead of wrapping it in `applyDecorators`, when it is written as `export const X = function () {...}`, and when it is declared in one package and used in another. A decorator only counts when every path out of it returns a guard, so one that guards on a single branch no longer clears a route. `security/require-guards-on-endpoints` drops from 246 findings to 22 on a 249-route monorepo whose auth decorator lives in a shared library.
