---
"nestjs-doctor": minor
---

Replace the report's Endpoints canvas with a walk of the code graph: every method a route reaches laid out by call depth with one wire per call site, a player that steps the execution walk, a one-line verdict on whether the route's first database call is a read or a write, and a source pane that opens a method beside the map (a database or external node opens at the call site that reached it). The interactive menu's HTML report now carries the code graph, and the artifact gains an optional `root`, the posix path the scan ran from. A report saved before the code graph existed shows no Endpoints tab instead of the old canvas. A share written from the report's own dialog carries the code graph, with file paths relative to the scan root, so its Endpoints tab opens; a share from the command line or the menu does not.
