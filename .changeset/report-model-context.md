---
"nestjs-doctor": patch
---

The report registers four read-only tools with the browser's model context when it has one: `get_summary`, `list_findings`, `explain_endpoint` and `explain_boot_trace`. A browser without the API sees no change.
