---
"nestjs-doctor": patch
---

A monorepo scan resolves the workspace-root schema once instead of once per
sub-project.

`buildSubProjectContext` falls back to the workspace root when a sub-project's
own extraction comes back empty, and the answer is the same every time. On a
9,836-file Nx workspace it ran **42 times**, each repeating the file lookup
across the whole tree. #217 made that lookup more expensive by giving it a
search. The root is one path per scan, so it is now resolved once and shared.

The fallback also no longer runs for an ORM it cannot help. `extractSchema`
passes the target path only to the Prisma extractor; TypeORM, Drizzle and
MikroORM take the source files they are handed and ignore it, so for those the
fallback re-ran the identical extraction with identical inputs and could only
reach the identical empty result. On a large TypeORM monorepo that was a second
walk over every file, per sub-project, that could never change an outcome.

No finding moves: the 46-project schema corpus is unchanged at 419 entities and
261 findings, and the workspace above still reports 33 entities and 36
relations.

This closes the follow-up #194 recorded when it added the fallback: "sharing one
extraction across sub-projects… deduplicating the work is a separate question".
