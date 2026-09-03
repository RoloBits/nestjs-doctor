---
"nestjs-doctor": patch
---

Stop `architecture/no-circular-module-deps` reporting a cycle that exists in no file: two `@Module()` classes sharing a name were analysed as one module with their imports unioned, so two acyclic files reported `CoreModule -> UsersModule` at `error`. Detection now walks each declaration and follows each import statement to the file it resolves to; a real cycle is still reported once. A regression from 0.9.x, and scores rise wherever it fired.
