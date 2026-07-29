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

**`prisma.config.*` is read, and read first.** Prisma treats it as authoritative
and ignores the `package.json` key when one exists, so a declared path now beats
both conventional locations. Comments are stripped before the path is read and
every `schema` key in the file is tried, taking the first that declares a model,
so neither a commented-out old path nor a nested `datasource: { schema: … }`
wins.

**A bounded search runs last**, only when nothing above located a schema. It
skips `node_modules`, generated client output, scaffolding templates,
`examples/`, `sample/`, `test/`, `e2e/` and build directories, and
dot-directories are skipped too, which is what keeps a worktree copy out. A
guessed directory has to declare a model and has to look like a schema's own,
either named `prisma` or holding a `schema.prisma`; without that second rule a
vendored reference schema stood in for the project's own in one corpus project.

The conventional directory now also accepts a folder holding no `schema.prisma`,
which Prisma has allowed since 5.15.

Measured over the 46 corpus projects that hold a `.prisma` file, scanned at their
roots: **355 entities to 419, and 223 schema findings to 261**. Four projects
gain a schema. One drops by one entity, correctly: it declares
`schema: 'prisma/schema.prisma'` in a `prisma.config.ts`, and the entity came
from a `schema-old.prisma` sibling the project does not use.

Known limitation: a project that declares nothing and keeps a stale copy beside
its schema merges both, because Prisma merges siblings and nothing distinguishes
a backup from a legitimate second file.
