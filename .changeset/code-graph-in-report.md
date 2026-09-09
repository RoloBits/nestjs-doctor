---
"nestjs-doctor": minor
---

Build the code graph during a scan and embed it in the report artifact, so `--report` and `--format report-json` carry one node per declared method with each call site as an edge. Calls to functions and static methods the project declares are now nodes too, which on a 1444-file monorepo adds 142 nodes and 1048 edges. Nothing else builds it: a console scan, `--format json` and `--score` are unchanged and pay nothing.
