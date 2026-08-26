---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the scan worker now receives only
the options the engine steps read (ScanOptions) instead of the full CLI
options object, and the defensive re-sanitization on both sides of the
worker boundary is gone.
