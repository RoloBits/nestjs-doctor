---
"nestjs-doctor": minor
---

Add the project-wide code graph to the Node API: one node per declared method of every Nest class, with each call site as an edge, so a method reached by two endpoints is one node instead of one subtree per path. Each node carries its ordered body, so a consumer can replay what an endpoint does: the conditions enclosing each call, which arms are mutually exclusive, where control returns or throws, whether a call is awaited, and which `try` covers it. `encodeCodeGraph` and `decodeCodeGraph` round-trip it through a compact form that is under a third of the size. Nothing in the CLI or the report builds it yet, so no scan gets slower and no output changes.
