---
"nestjs-doctor": patch
---

`ModuleNode.importsByFile` now holds, per declaration file, both the imported module names and the file each import statement resolves to (`{ names, targets }`); the separate `importTargetsByFile` field is gone. Both fields were added in this release cycle, so nothing published changes shape, and no diagnostic changes. Custom rules that read `moduleGraph.modules` see the same `imports`, `exports` and `providers` as before.
