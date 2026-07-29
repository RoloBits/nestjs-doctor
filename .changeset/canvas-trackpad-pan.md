---
"nestjs-doctor": patch
---

Two-finger scrolling a diagram in the HTML report now pans instead of zooming.

Every canvas in the report treated a wheel event as zoom, and a trackpad sends
one for a plain two-finger scroll, so trying to move around the diagram zoomed it
instead. A pinch arrives as a wheel event with `ctrlKey` set, which is what now
zooms. This matches how the rest of the diagram already behaves, since dragging
the background has always panned.

Applies to all three diagrams: the modules graph, the endpoints graph and the
relational schema. On a mouse, the wheel now scrolls the diagram and ctrl or
command with the wheel zooms.
