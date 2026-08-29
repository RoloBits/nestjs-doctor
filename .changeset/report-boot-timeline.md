---
"nestjs-doctor": minor
---

The report's two boot timelines, the phase strip and the per-module bar list, are replaced by one Boot trace tab in the style of an APM waterfall. It wears the same shell as the Modules graph, Endpoints, and Schema tabs: a sidebar-style label column with the module tree, its count, expand and collapse, and a filter, then lanes with the lifecycle phases carrying the viewport window and the time axis.

Every class sits at its real offset from boot start, grouped by module and colored by type. The lanes zoom on wheel, pan on axis drag, and frame a phase on click. Dependency cascades open level by level as shadow rows, a hover card follows the pointer over a bar, and the label column drags to resize and hides like the graph's sidebar.

The Modules graph dock keeps a compact mount of the same timeline on the same axis, and module nodes show the build of their slowest class plus their hook time. Dumps whose hook timings carry `startMs` render hooks as labelled spans; older dumps keep duration chips. The `report-ui` entry now exports `renderBoot` and `focusBootTrace` for the tab, in place of `jumpToSlowestBoot`.
