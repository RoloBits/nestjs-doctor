---
"nestjs-doctor": patch
---

Detect Nx projects that have no `package.json` of their own.

Nx keeps a single dependency list at the workspace root — that is its
single-version policy — so most Nx projects have a `project.json` and no
`package.json`. `detectNxMonorepo` required a sibling `package.json` carrying a
direct `@nestjs/core` or `@nestjs/common` dependency, and skipped everything
else without a word.

On `amplication/amplication` that meant 9 of its 21 NestJS projects were
invisible, `packages/amplication-server` among them — 794 files importing
`@nestjs`, 59 module files. Pointing the CLI at the repository root scanned 252
files and reported 66 findings.

A project with no usable `package.json` now qualifies when it contains a
`*.module.ts` that imports `@nestjs/common`. Nx workspaces routinely hold
Angular projects, which use the same file name, so the import is what separates
them.

Across the 15 Nx repositories in a 189-project corpus: 3,354 files scanned
becomes 3,963, and 1,997 findings become 2,679. Amplication alone goes from 252
files to 1,655. The repositories that scan *fewer* files now were previously
running NestJS rules over Angular code — `ZenSoftware/zen` no longer reports on
`libs/auth`, which has 40 files importing `@angular` and none importing
`@nestjs`. Non-Nx projects are untouched.
