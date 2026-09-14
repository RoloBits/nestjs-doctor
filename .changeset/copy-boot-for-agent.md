---
"nestjs-doctor": patch
---

The report's Boot trace tab gains a **Copy for AI agent** button that copies the active trace as plain text: the phases, the last class built and what it waited on, the ten slowest modules and classes with their own time after their dependencies, and the slowest hooks. A `--json` run now accepts `--timings` and carries the same text under `boot`, one entry per trace, and the `nestjs-boot-trace` skill reads it there instead of asking an agent to open the HTML.
