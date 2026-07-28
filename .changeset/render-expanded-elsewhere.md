---
"nestjs-doctor": patch
---

The endpoint graph in the HTML report now says when a node's calls are drawn
somewhere else.

When a trace reaches a class it has already expanded at an earlier call site, it
collapses the repeat and marks the node `expandedElsewhere`. Nothing read that
flag, so the node was drawn with no children and no explanation, which is
exactly how a genuine leaf is drawn. A reader had no way to tell "this service
calls nothing" from "this service's calls are up there".

A marked node now carries a `SHOWN ABOVE` badge, and hovering it says "Calls
drawn at an earlier call site" beneath the existing "Conditionally called". One
report generated from a mid-sized public project has six such nodes.

Also adds the first test over the report's client script. It is a template
string, so `tsc` never sees it and a syntax error would only surface in a
browser; the test parses it.
