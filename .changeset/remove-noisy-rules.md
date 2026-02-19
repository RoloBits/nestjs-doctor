---
"nestjs-doctor": patch
---

Remove noisy rules that produced too many false positives

- **no-god-module**: Removed — flagging modules with many providers/imports was too opinionated for most projects
- **no-logging-in-loops**: Removed — logging inside loops is often intentional for debugging
- **prefer-pagination**: Removed — `findMany()`/`find()` without pagination is valid in many contexts
- **no-query-in-loop**: Removed — `await` inside loops is sometimes intentional and unavoidable
