---
"nestjs-doctor": patch
---

Three additions to the schema diagram: deselecting by clicking away, a zoom bar,
and a control to show every column.

Clicking a table selected it and dimmed the rest, but the only way back was to
click the same table again. Clicking empty canvas now clears the selection.
Dragging the background still pans without losing it.

The top right corner gains a zoom bar with a slider, plus and minus buttons, and
a readout that fits the diagram to the view when clicked, so zooming no longer
depends on a trackpad gesture.

Tables were capped at seven columns with a "+N more" line and no way to see the
rest. A new toolbar control shows every column, and the diagram is laid out again
afterwards so the taller boxes do not overlap.
