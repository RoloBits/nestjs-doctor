---
"nestjs-doctor": patch
---

Add MikroORM schema extractor. Projects depending on `@mikro-orm/core` now
benefit from the three `schema/*` rules and the ER diagram in the HTML
report. Previously, MikroORM projects were detected but produced an empty
schema graph; the extractor closes that gap with parity to the TypeORM
extractor — entity, columns, relations including `Collection<T>` / `Ref<T>`
type-arg resolution, `@Enum`, `@Unique`, composite `@Index`, abstract base
class skipping, and `deleteRule` (v6) / `onDelete` (legacy) cascade
detection.

Closes #118.
