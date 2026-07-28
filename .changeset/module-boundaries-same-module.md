---
"nestjs-doctor": patch
---

Stop `architecture/require-module-boundaries` flagging imports that never leave
their module.

The rule matched any relative import containing `../` plus an internal directory
name, without checking whether the import leaves the current module. Two kinds
of false positive followed:

- A module reading its **own** internals through a sibling directory —
  `mappers/file.mapper.ts` importing `../entities/file.schema`, with the module
  file right beside both. 13 of 49 findings on `brocoders/nestjs-boilerplate`.
- Shared utilities under an application's **root** module — `common/pipes`
  importing `../dto`, `decorators` importing `../guards`. 15 of 16 findings on
  `buqiyuan/nest-admin` and 5 of 21 on `NarHakobyan/awesome-nest-boilerplate`.

The rule now resolves the import and compares the nearest module directory of
source and target — module directories being those holding a `*.module.ts` file
or a `@Module()` class. Only an import whose two sides positively resolve to the
same module is skipped; a cross-module import, an unknown side, or a project
with no visible modules reports exactly as before.

One consequence to know about: a project that registers everything in a single
root module has no internal module boundaries, so folder-to-folder deep imports
there are no longer reported. The rule reads NestJS's module structure, not the
directory layout.
