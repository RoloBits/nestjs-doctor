---
"nestjs-doctor": patch
---

A report generated from the post-scan menu now honours `--no-telemetry`, `DO_NOT_TRACK`, and the `telemetry` and `report.telemetry` config keys. Before, the interactive path always embedded the report beacon; `--report` and the Node API already respected them. Also adds a NestJS 12 ESM fixture to the integration suite and documents a clean scan as an expected result.
