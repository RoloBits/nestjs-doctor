---
"nestjs-doctor": patch
---

### Fixed

`architecture/no-circular-module-deps` no longer reports a cycle that exists in no file. Two `@Module()` classes sharing a name are analyzed as one module, and cycle detection walked the union of their imports, so two acyclic files — one declaring `CoreModule` importing `UsersModule`, another declaring `UsersModule` importing `CoreModule` — reported `CoreModule -> UsersModule` at `error` severity.

Cycle detection now walks each declaration separately and picks the target of an imported name by following the import statement that reaches it: the declaration in the resolved file, else one in the importing file, else every declaration carrying the name. So a cycle is reported only when one declaration chain actually closes, in the one-module-per-file layout as well as in files declaring several modules. A real cycle whose member is also declared elsewhere is still reported, once.

Not covered: file attribution of a real cycle among same-name modules still anchors to the first declaration, and the HTML report's module picture still draws the union of every declaration's edges, so it can show an edge the rule no longer flags.

This is a regression from 0.9.x, where same-name modules started merging instead of overwriting each other. `no-circular-module-deps` was the only rule affected; the module graph's `edges`, the report's graph, and the other five rules reading it are unchanged. Scores rise wherever this phantom cycle was firing.
