---
"nestjs-doctor": patch
---

Add `trigger`, `scan_id`, `output_format`, `report_requested`, `total_ms` and `suppressed_inline` to the `scan_completed` payload, and send it for `--report` runs, which reported nothing before.
