---
"nestjs-doctor": minor
---

Add `--timings <path>` to overlay real bootstrap init times on the HTML report's modules graph. The file is a NestJS `SerializedGraph` dump produced by booting once with `NestFactory.create(AppModule, { snapshot: true })` and writing `app.get(SerializedGraph).toString()` (requires `@nestjs/core` >= 9.3). Each module node shows its slowest class's construction time, the tooltip gains a slowest-class line, and the detail panel lists every class slowest-first with a note that times include awaited dependencies. Clicking a class opens a Gantt-style boot trace in a bottom drawer: the injection cascade rendered as nested bars from the dump's class-to-class edges, with an amber segment marking the part of each class's time not explained by its slowest dependency.

Timings are display-only: they never enter the score, diagnostics, exit codes, or fingerprints, and a report generated without the flag is unchanged. An unreadable or unrecognized dump degrades to a stderr warning and the report renders without timings. In a monorepo, a timing attaches only when its module class name is unique across projects; ambiguous names show the no-data state instead of a guess.
