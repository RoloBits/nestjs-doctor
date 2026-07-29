---
"nestjs-doctor": patch
---

The schema diagram's zoom bar joins the other controls on one row, every control
explains itself on hover, and columns are marked with what they are.

The zoom bar sat on its own line below the toolbar. It is now part of the same
row, so the diagram controls read as one group.

Each control had a bare label like "Expand tables", which says what it is called
but not what it does. They now carry a name and a short line of explanation,
shown in a tooltip styled like the rest of the report rather than the browser's
own.

A table's columns were an undifferentiated list. A primary key, a foreign key and
an indexed or unique column now each carry their own glyph, matching the icons
already used in the sidebar tree. Foreign keys are matched from the entity's
relations, by the property name or that name with an Id suffix.
