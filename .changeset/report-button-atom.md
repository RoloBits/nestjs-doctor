---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the report's icon buttons now come from a single component. `src/report/ui/components/button.ts` renders every `st-btn`, backed by a registry of twelve named icons in `components/icons.ts`, replacing twenty-two hand-written button blocks across the four tab markup chunks. The emitted report is byte-identical.
