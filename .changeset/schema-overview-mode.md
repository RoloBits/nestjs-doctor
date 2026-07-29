---
"nestjs-doctor": minor
---

The HTML report's schema diagram can now show every table at once.

The schema tab decided its mode at render time with `entities.length > 7` and
never revisited it, so any schema past that size could only ever show one table
and its direct neighbours. There was no control to leave that view, and the
all-tables layout already existed but was unreachable. On a real 34-table schema
you landed on an empty canvas and stayed there.

There is now a toggle in the diagram toolbar, and a **Show all tables** button on
the empty state itself, which is where a large schema lands.

Tables are laid out per connected component and the components are packed
together, because one dagre pass puts every unrelated table in a single rank. The
same 34-table schema is 18 components with 12 tables that have no relation at
all, so that rank was most of the diagram.

The overview opens with columns showing, at a zoom where they are readable,
anchored at the top left so you pan through the diagram rather than starting in
the middle of it. Minimising the tables switches back to the fit-everything
bird's eye view, which can now zoom out further than the old hard floor allowed.

Node labels are now measured once when the layout is built instead of on every
frame, which makes panning cheaper in both modes.
