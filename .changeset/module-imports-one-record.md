---
"nestjs-doctor": patch
---

Fold `ModuleNode.importTargetsByFile` into `importsByFile` as `{ names, targets }` per declaration file; both fields are new this cycle, so no published shape or diagnostic changes.
