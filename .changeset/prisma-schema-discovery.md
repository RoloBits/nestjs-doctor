---
"nestjs-doctor": patch
---

A Prisma schema is now found when it does not sit in one of the two
conventional places.

`findPrismaSchemaFiles` checked `<project>/prisma/schema.prisma`,
`<project>/schema.prisma`, and a `prisma.schema` field in `package.json`, then
gave up. An Nx workspace that keeps its schema in a library, which is the normal
shape, got nothing: the ORM was detected as Prisma, the schema graph came back
empty, the ER diagram never rendered, and the three schema rules were skipped in
silence. On one 9,836-file workspace that is 33 models and 36 relations that
were never checked.

Two things are added, in order.

**`prisma.config.*` is read.** Across 211 public projects, 14 declare their
schema there against 1 using the `package.json` field, and it is the only thing
that points at a schema folder. Both a file and a directory work.

**A bounded search runs last**, only when nothing above located a schema. It
skips what such a search otherwise drags in, all of which occurs in the corpus:
`node_modules`, generated client output, scaffolding templates, `examples/`,
`sample/`, `test/`, `e2e/`, and build directories. Dot-directories are skipped
too, which is what keeps a worktree copy from being mistaken for the schema.

The conventional directory now also accepts a folder holding no `schema.prisma`,
which Prisma has allowed since 5.15.

Measured over the 46 corpus projects that have a `.prisma` file, scanned at
their roots: **355 entities to 438, and 223 schema findings to 268**. No project
loses an entity. Four gain one: two through `prisma.config.ts`, one through
folder mode, one through the nested search.

Known limitation: a directory holding both a schema and a stale copy such as
`schema-old.prisma` merges both, because Prisma merges siblings and nothing
distinguishes a backup from a legitimate second file.
