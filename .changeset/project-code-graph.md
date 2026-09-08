---
"nestjs-doctor": patch
---

Add the project-wide code graph: one node per declared method of every Nest class, with each call site as an edge, so a method reached by two endpoints is one node instead of one subtree per path. Not wired into the pipeline yet, so no output changes.
