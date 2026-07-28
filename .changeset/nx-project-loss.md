---
"nestjs-doctor": patch
---

Four ways an Nx workspace could report less than it should, all found auditing
the monorepo detection widened this week.

**A project whose NestJS module sorted past the twentieth was dropped.**
Detection read at most 20 `*.module.ts` files looking for a `@nestjs/common`
import, so a project with more module files than that could be excluded whole.
The cap saved nothing measurable: across 152 project directories in 15 public
Nx workspaces, no project that misses the probe has more than 20 module files.
It is gone, and the probe now reads until it finds one.

**Two projects declaring the same name collapsed into one.** Projects are
recorded in a `Map` keyed by `package.json` name, then `project.json` name, then
path. The first two are not unique, so the second project silently replaced the
first. The name is now used only when free, and the project root, which is
unique by construction, takes over when it is not.

**A project nested inside another had its files counted twice.** Each project
root is globbed independently, so `apps/api` absorbed everything under
`apps/api/nested` while `apps/api/nested` collected it too. Every finding in the
nested project was reported twice and the score denominator was inflated. A
parent now excludes the roots nested under it, so a file belongs to the
innermost project that claims it.

**A workspace-root schema was extracted once per sub-project.** Sub-projects
inherit the root `package.json`, so each detects the same ORM, finds no local
schema, and falls back to the root one. Two Nest sub-projects sharing a root
`prisma/schema.prisma` reported every entity twice. Schema entities and schema
findings are now deduplicated when sub-project results merge.

None of the four occurs across 189 public projects, and the corpus is unchanged
at 13,574 findings. Each reproduces on a fixture: the probe one hides 23 files
including a live GitHub token behind a score of 96, "Excellent".
