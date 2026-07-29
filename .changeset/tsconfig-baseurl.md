---
"nestjs-doctor": patch
---

The ts-morph checker now honours a tsconfig `baseUrl`, so an entity that extends
a base class imported as `src/common/entity/custom-base.entity` inherits its
columns.

`loadPathAliases` returns early when a tsconfig declares no `paths`, and
`createAstParser` never passed `baseUrl` to the compiler options at all. A
project that resolves bare specifiers through `baseUrl` alone therefore got no
resolution: `gobeam/truthy` sets `"baseUrl": "./"` with no `paths`, and every
entity extending its `CustomBaseEntity` was reported as having no primary key
and no timestamps, though the base declares `@PrimaryGeneratedColumn`,
`@CreateDateColumn` and `@UpdateDateColumn`.

This is the same defect issue #154 fixed for path aliases, in the other
resolution mode.

Across 189 public projects the schema rules lose 19 findings: `require-primary-key`
19 to 15, `require-timestamps` 183 to 168.

Resolution also improves for every rule that consults the checker: **34 findings
appear** that it could not reach before, and **12 more are retired** as false
positives, on top of the 19 schema ones. Corpus net is +3. Spot-checked in both
directions and correct: an unawaited `this.trackingService.trackRaceStarted()`
was unreadable while the service's type could not be resolved, and 12
`no-fire-and-forget-async` findings in one project turn out to name methods
declared `void`. The same thing happened when `paths` was added in #158.

This reaches the checker only. `buildModuleGraph` still resolves module imports
through `resolvePathAlias`, which has no `baseUrl` fallback, so cycles, unused
providers and unused exports stay blind on these projects: no architecture rule
moved anywhere in the corpus. That is a separate change.

`paths` and `baseUrl` are read in one parse rather than two, so a monorepo does
not pay for the same tsconfig twice per sub-project.

Peak RSS and elapsed are unchanged. Measured on the 9,836-file Nx workspace that
motivated #198's memory work: **2,684 MB and 54.8 s before, 2,591 MB and 50.3 s
after**, with identical findings. `baseUrl` only widens a probe within the
scanned tree, so `skipFileDependencyResolution` still holds.
