---
"nestjs-doctor": patch
---

Stop the endpoint dependency trace re-expanding shared subtrees.

`buildMethodDependencyTree` traces one node per call site, which is the point —
call order and conditionality stay visible. But it re-expanded a callee's whole
subtree at every path that reached it, so a diamond in the call graph grew
multiplicatively.

On `bookorbit/bookorbit` a single endpoint's trace held 126,708 nodes covering
44 distinct classes, `DatabaseService` among them 33,860 times. Whole-project
`--format json` came to 249 MB and died with an unhandled
`RangeError: Invalid string length` from `JSON.stringify` — exit 1, no output,
indistinguishable from a failed scan. 2 of 76 public projects crashed this way.

A class's subtree is now expanded at its first call site in an endpoint; later
call sites keep their own node and carry `expandedElsewhere: true`. A per-endpoint
ceiling of 5,000 serialised nodes backs it up, and an endpoint that hits it is
marked `truncated` and reported on stderr rather than cut silently.

Across the same 76 projects the trace drops from 725,159 nodes to 190,614 and
the JSON from 555 MB to 158 MB, with every diagnostic unchanged.
