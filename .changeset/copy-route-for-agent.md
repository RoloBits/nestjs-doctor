---
"nestjs-doctor": patch
---

The report's Endpoints tab gains a **Copy for AI agent** button that copies the selected route's walk as plain text: the database verdict and what it means, the steps the default filter keeps with their flags and call sites, the conditions and guards above them, and the source lines of the first read and write. The same text sits on every endpoint as `explain` in `--format json`, which now builds the code graph, and the installed `nestjs-doctor` skill tells an agent to read it.
