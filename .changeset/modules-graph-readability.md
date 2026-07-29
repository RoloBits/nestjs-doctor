---
"nestjs-doctor": patch
---

The report's modules graph is laid out instead of simulated, so it can be read.

The tab ran a force simulation over nodes seeded on a circle of radius 248 while
the boxes were up to 407px wide, so they could not avoid piling up. On a
66-module workspace that left **221 overlapping pairs**, with **98% of modules**
covering another one. There was little for a simulation to reveal in the first
place: 19 import edges across 47 groups, 29 of them a single module.

Each connected group is now laid out top down, so a module sits above what it
imports, and the groups are packed together. Modules with no import links are
gathered into one labelled block under the rest, rather than scattered. The
simulation, its constants and the per-frame animation loop are gone; dragging a
module still moves it, and the layout no longer changes shape when the project
filter is touched.

Boxes are capped at 220px with the module name on its own line, so a long project
prefix can no longer push it out of view. The old code measured a short count
string while drawing a longer one, so boxes were sized for text narrower than
what went into them.

The tab also gains the zoom bar and re-center control the schema diagram has.
