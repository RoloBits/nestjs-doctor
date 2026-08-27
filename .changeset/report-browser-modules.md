---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the report's shared tree helpers are now real TypeScript modules instead of text inside a template literal. `src/report/ui/browser/` is bundled to an IIFE and inlined into the report ahead of the remaining script chunks, so `buildFileTree`, `compressTree`, `worstSev`, `worstSevNode` and `countItems` have one definition that the type checker and the linter can both see. The rendered report is unchanged, verified against a jsdom snapshot of every tab.
