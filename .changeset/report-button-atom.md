---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the report's markup chunks now render their repeated families from components in `src/report/ui/components/`. Icon buttons, tab-bar buttons, filter pills, the modules-graph legend and the Rule Lab selects each have a single definition, backed by a registry of twelve named icons. Twenty-two hand-written button blocks and four repeated markup families are gone from the tab chunks. The emitted report is byte-identical.
