---
"nestjs-doctor": patch
---

`--init` now ends by printing one line to paste into `AGENTS.md` or `CLAUDE.md`, so a coding agent runs `npx nestjs-doctor --blocking error --verbose` before it calls a task done. It prints the line only; it edits neither file.
