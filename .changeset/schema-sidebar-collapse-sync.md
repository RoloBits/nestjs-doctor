---
"nestjs-doctor": patch
---

The schema tab's table list can be hidden, and it follows the diagram by default.

A button in the list header hides it so the diagram gets the whole width, and a
button on the diagram brings it back. The view stays put across the change rather
than jumping, because the camera shifts by half the width it gained or lost.

A **Sync with diagram** checkbox, on by default, ties the two together. Picking a
table in the diagram opens that table in the list, opens its columns, and scrolls
to it. Clicking empty canvas clears the selection and closes everything. Unchecking
it leaves the list alone, so the two can be driven separately.

Also fixes three things in the list: the tooltips were cut off, because the list
scrolls and so clips anything drawn outside it; a row's trailing detail such as
`= uuid()` ran under the right edge, since the name never gave up space; and the
new checkbox sat flush against the header.
