---
"nestjs-doctor": patch
---

Find a workspace-root ORM schema from every sub-project.

In monorepo mode each sub-project extracts its schema relative to its own
directory:

```ts
const schemaGraph = extractSchema(astProject, files, project.orm, projectPath);
```

A monorepo usually keeps one schema for the whole workspace, at the root. It sits
outside every sub-project, so no sub-project found it, and the three schema rules
reported nothing — which reads exactly like a schema with no problems.

`ghostfolio/ghostfolio` keeps `prisma/schema.prisma` at the repository root.
Scanned as a single project it reports 11 schema findings; scanned as the
monorepo it is, it reported 0, while still naming `prisma` as the detected ORM.

A sub-project that finds no schema of its own now retries from the workspace
root. A sub-project that owns one is unaffected.

Separately, when an ORM is detected and the schema graph is still empty, a
warning now goes to stderr in every format, so "found nothing" stops looking like
"found nothing wrong".

Closes #192.
