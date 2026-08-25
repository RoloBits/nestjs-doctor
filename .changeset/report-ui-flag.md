---
"nestjs-doctor": minor
---

Add `--report-ui` (and a `report.ui` config key) to render the HTML report with the React shell instead of the legacy template. The React variant ships the Summary, Findings, Modules Graph, and Endpoints tabs, is one self-contained file that loads no external scripts, and stays behind the flag while the remaining tabs port.
