---
"nestjs-doctor": patch
---

`expandedElsewhere` now means what it says, and the report shows it.

The endpoint trace collapses a class it has already expanded and marks the node
so a reader can be told the calls are drawn somewhere else. Two things were
wrong with that.

**The flag was set on classes that were never expanded.** It is written in the
branch that runs when a repeat finds no cached subtree, and the cache is only
written for a class that has a provider. So `CommandBus`, `ConfigService`, a
TypeORM `Repository`, anything the scan has no source for, got flagged on every
occurrence after the first, pointing at a subtree that does not exist. In one
report of a mid-sized public project, all six flagged nodes were `CommandBus`,
which has no children anywhere in it. Across two larger projects the flag fell
from 946 to 520 and from 6 to 0. The remaining ones are real: a class expanded
once, reached again by another path.

**Nothing read the flag.** A collapsed node was drawn with no children and no
explanation, which is how a genuine leaf is drawn too. A marked node now carries
a `↱` on the info row and says "Calls drawn at another call site" on hover. The
marker is a glyph rather than a label because a label wide enough to read did
not fit beside a `REPOSITORY` or `CONTROLLER` type badge, and it says "another"
rather than "above" because the layout puts roughly a fifth of them level with
or below the node.

Also adds the first test over the report's client script. It is a template
string, so `tsc` never sees it and a syntax error would only surface in a
browser; the test parses it.
