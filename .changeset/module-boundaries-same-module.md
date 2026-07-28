---
"nestjs-doctor": patch
---

Stop `architecture/require-module-boundaries` flagging a module's own internals.

The rule matched any relative import containing `../` plus an internal directory
name, without checking whether the import leaves the current module. A mapper
importing its own module's entity through a sibling directory —
`mappers/file.mapper.ts` reading `../entities/file.schema`, with the module file
right beside both — was reported as reaching into another module. On
`brocoders/nestjs-boilerplate` 13 of 49 findings were of this kind, and shared
utilities under an application's root module accounted for 15 of 16 on
`buqiyuan/nest-admin`.

The rule now resolves the import and compares the nearest module directory of
source and target — module directories being those holding a `*.module.ts` file
or a `@Module()` class. Only an import whose two sides positively resolve to the
same module is skipped; a cross-module import, an unknown side, or a project
with no visible modules reports exactly as before.
