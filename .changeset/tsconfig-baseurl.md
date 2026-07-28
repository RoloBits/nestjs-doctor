---
"nestjs-doctor": patch
---

The scan now honours a tsconfig `baseUrl`, so an entity that extends a base
class imported as `src/common/entity/custom-base.entity` inherits its columns.

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

Resolution also improves for every rule that consults the checker, so 22
findings appear that were previously invisible. Spot-checked, they are real: an
unawaited `this.trackingService.trackRaceStarted()` was unreadable while the
service's type could not be resolved. The same thing happened when `paths` was
added in #158.
