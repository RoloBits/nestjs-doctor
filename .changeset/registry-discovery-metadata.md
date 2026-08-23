---
"nestjs-doctor": patch
"nestjs-doctor-lsp": patch
"nestjs-doctor-vscode": patch
---

Point the npm `homepage` field at the docs site and widen the registry keywords.

`nestjs-doctor` sent its homepage link back to the GitHub readme, so the most
authoritative page linking to the project skipped the docs site entirely, and
`nestjs-doctor-lsp` carried no homepage at all. Both now link to the docs. The
keyword lists gain the terms people actually search for — `static-analysis`,
`module-graph`, `dependency-graph`, `circular-dependency`, `code-quality` — and
drop `health-check`, which collides with `@nestjs/terminus` health endpoints and
attracts the wrong query.
