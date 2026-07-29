---
"nestjs-doctor": patch
---

Fixes found reviewing the schema diagram work.

A schema of five tables or fewer laid itself out against the wrong box heights.
The initial layout ran before the boxes were sized, so dagre spacing, the edge
ports and the fit zoom were all computed for 52px rows and the tables then drew
up to twice that. It sizes them first now.

The zoom slider and the pinch gesture used different floors, so dragging the
slider to 5% and then pinching once snapped the view back in to 20%. Both use one
floor, and the slider covers the full range the camera allows.

Visiting the all-tables view latched columns on for good, so going back to a
focused table showed full column lists however many neighbours it had. Whether
columns show is one rule again, and an explicit choice still wins.

A foreign key column named `user_id` was marked as merely indexed, because the
match ignored punctuation. Names are compared without it, so a renamed or
snake_case key column reads as a foreign key.

The two toggles keep their accessible name in step with what they do and report
their pressed state, and the tooltips appear on keyboard focus, not only on hover.
