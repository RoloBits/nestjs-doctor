---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the report layer no longer imports
from the CLI layer, and the shared types in `common/` no longer import
from `report/` or `engine/`. UI helpers (`logger`, `highlighter`,
`spinner`) moved from `src/cli/ui/` to `src/ui/`; timing types and
`RuleScope` now live in `src/common/`. Types that still had importers at
their old homes are re-exported from there.
