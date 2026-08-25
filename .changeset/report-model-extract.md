---
"nestjs-doctor": patch
---

Extract a typed `ReportModel` layer (`src/report/model/`) ahead of the React report UI. No behavior change — the emitted report script is byte-identical, pinned by a golden-hash test.
