---
"nestjs-doctor": patch
---

A monorepo scan resolves the workspace-root schema once instead of once per
sub-project.

`buildSubProjectContext` falls back to the workspace root when a sub-project's
own extraction comes back empty, and the answer is the same every time. On an Nx
workspace with 29 Nest sub-projects it ran **28 times**, each repeating the file
lookup across the whole tree. #217 made that lookup more expensive by giving it a
search. The root is one path per scan, so it is now resolved once and shared.

The fallback also no longer runs for an ORM it cannot help. Only Prisma locates
its schema from the target path; TypeORM, Drizzle and MikroORM read the source
files they are handed, so for those the fallback re-ran the identical extraction
with identical inputs and could only reach the identical empty result. Each
extractor now declares this on `OrmSchemaExtractor`, so the compiler asks for it
when an ORM is added. On a TypeORM monorepo the root extractions drop from 2 to
0.

No finding moves: the 46-project schema corpus is unchanged at 419 entities and
261 findings, every repo individually, and the workspace above still reports 34
entities, 36 relations and the same 237 diagnostics.

This closes the follow-up #194 recorded when it added the fallback: "sharing one
extraction across sub-projects… deduplicating the work is a separate question".
