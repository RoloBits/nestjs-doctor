---
"nestjs-doctor": minor
---

The HTML report reports how it is used, alongside the tab it was opened on: a
fixed name for each interaction it counts, and click positions as percentages
of the window so the layout can be measured.

The interactions are running the rule lab, loading a preset, changing its scope
or metadata, editing its code, opening one of its results, opening a module
from a finding or from the tree, recentring or zooming the graph, collapsing
its sidebar, expanding the module or schema tree, opening an endpoint's code,
and opening the boot trace.

Every name is a literal from a list compiled into the beacon, and a click is
two numbers plus a tab name from that same list, so no element text, file path,
class name, or source from the report ever travels. A test runs the beacon
against a page whose every readable value is a marker string and asserts no
payload contains it, so a future change that reads the page fails rather than
ships.
