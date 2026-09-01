---
"nestjs-doctor": patch
---

### Fixed

`architecture/no-circular-module-deps` no longer reports a cycle that exists in no file. Two `@Module()` classes sharing a name are analyzed as one module, and cycle detection walked the union of their imports, so two acyclic files — one declaring `CoreModule` importing `UsersModule`, another declaring `UsersModule` importing `CoreModule` — reported `CoreModule -> UsersModule` at `error` severity. Cycle detection now walks each declaration separately, resolving an imported name to the declaration in the importing file when that file declares it. A real cycle whose member is also declared elsewhere is still reported, once.

This is a regression from 0.9.x, where same-name modules started merging instead of overwriting each other. `no-circular-module-deps` was the only rule affected; the module graph's `edges`, the report's graph, and the other five rules reading it are unchanged. Scores rise wherever this phantom cycle was firing.
