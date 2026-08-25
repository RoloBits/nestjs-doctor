---
"nestjs-doctor": patch
---

Extract a typed `ReportModel` layer (`src/report/model/`) ahead of the React report UI. The legacy report script is byte-identical, pinned by a golden-hash test.
