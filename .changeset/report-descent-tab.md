---
"nestjs-doctor": minor
---

Replace the report's Endpoints canvas with a walk of the code graph. The tab keeps its controller tree, and now lays every method a route reaches into columns by call depth, draws one wire per call site, steps the execution walk with a player, and states in one line whether the route's first database call is a read or a write. The sidebar gains expand-all, collapse-all and hide buttons plus a filter box. The tab needs the code graph, which only `--report` and `--format report-json` build, so a report saved before the code graph existed loses the Endpoints tab rather than falling back to the old canvas.
