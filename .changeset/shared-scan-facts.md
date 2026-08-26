---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the report facts each scan yields
(bootstrap entry roots and mapped providers) are now collected by one
shared function instead of four hand-copied loops across the CLI and
report pipelines.
