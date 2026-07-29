---
"nestjs-doctor": patch
---

The schema sidebar and the diagram now mark a column the same way.

The diagram gained key, link and index glyphs on columns, but the sidebar tree
still only told a primary key apart from everything else, so the same column
could be plain in the list and marked in the diagram. `Journey.name` is indexed,
and only one of the two views said so.

The sidebar now classifies a column exactly as the diagram does, and its indexes
group counts a plainly indexed column rather than only a unique one, which is why
that group was often missing. An indexed column also picks up an `idx` tag beside
`null`, `gen` and `uniq`.
