---
"nestjs-doctor": minor
---

The HTML report now reports which tab was opened. It sends two events,
`report_opened` and `report_section_viewed`, carrying the nestjs-doctor version
and one tab name — it reads nothing from the page, so no file path, project
name, or source text can travel with them. No cookie, no stored identifier, no
session recording.

`--no-telemetry` builds the report without it, or set `report.telemetry` to
`false` in the config file for the whole repository.
