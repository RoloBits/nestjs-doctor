---
"nestjs-doctor": patch
---

### Changed

`schema/require-timestamps` drops from `warning` to `info`. Each entity it reports now costs `0.5 × 1.1 = 0.55` penalty points instead of `1.5 × 1.1 = 1.65`, so schema-heavy projects' scores rise. Join tables, entities whose every column is a primary key or a relation's own column, are no longer reported at all.

`architecture/no-orm-in-services` no longer reports `PrismaService`/`PrismaClient`, so the official NestJS Prisma recipe is quiet. The "you can disable this rule" sentence is gone from its `help`.
