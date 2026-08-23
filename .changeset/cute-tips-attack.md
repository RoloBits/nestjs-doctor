---
"nestjs-doctor": minor
---

A scan now reports which well-known packages a project depends on: the NestJS
packages it uses, its ORM, database drivers, message queues, cloud vendors, and
frontend framework, plus the detected Nest version and HTTP adapter.

Every name is matched against a fixed list that ships with the CLI, so only a
package named in that list can ever be reported. A project's own dependencies —
private scopes, internal packages, anything not on the list — are never sent,
and neither is the manifest, its author, its repository, or its scripts.
