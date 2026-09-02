---
"nestjs-doctor": minor
---

### Added

Six fields on the `scan_completed` payload:

| Field | Value |
|---|---|
| `trigger` | How the run started: `action`, `ci`, `hook`, `agent`, `script`, `npx`, `global` or `skill` |
| `scan_id` | A random UUID per run, shared with the HTML report's beacon |
| `output_format` | The `--format` value, plus `report` for a `--report` run |
| `report_requested` | Whether the run was a `--report` run |
| `total_ms` | Wall time for the whole run; `duration_ms` still covers the rules on a single project and the whole scan on a monorepo |
| `suppressed_inline` | Built-in rule id to a count of findings silenced by an inline comment |

A `--report` run now reports `scan_completed`, where it previously sent nothing, and prints the first-run notice after the path to the written report.
