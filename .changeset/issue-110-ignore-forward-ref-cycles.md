---
"nestjs-doctor": patch
---

Add `ignoreForwardRefCycles` option to `architecture/no-circular-module-deps`. When enabled, cycles whose every consecutive edge uses `forwardRef()` are suppressed. One-sided `forwardRef` still flags. Default behavior unchanged. Closes #110.
