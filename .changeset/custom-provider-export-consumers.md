---
"nestjs-doctor": patch
---

### Fixed

`performance/no-unused-module-exports` no longer flags an export consumed only through an object-literal custom provider. A consumer registered as `{ provide: 'TOKEN', useClass: Notifier }` (or `useExisting`) now counts: the rule resolves the `useClass`/`useExisting` target and reads its constructor, the same way it already does for a plain `providers: [Notifier]` entry.
