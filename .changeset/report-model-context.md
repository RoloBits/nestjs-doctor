---
"nestjs-doctor": patch
---

The report registers seven tools with the browser's model context when it has one: four read-only ones, `get_summary`, `list_findings`, `explain_endpoint` and `explain_boot_trace`, and three that drive the Endpoints tab, `show_endpoint`, `walk_step` and `walk_position`. A browser without the API sees no change.
