---
"nestjs-doctor": patch
---

### Fixed

- A transient provider's lifecycle hooks were merged into one offsetless total and drew as a `+11ms init ×2` chip beside the class name. Each run now keeps its own `startMs` and draws as its own span on the timeline. The chip rendering is gone.

- The module detail panel's hook chips are gone too; the panel keeps its `build · init` summary line.
- A class that finishes within a millisecond of its slowest dependency keeps its own finish with no width, and a controller clocked from its module's later load start draws after that dependency instead of at boot start, so a shared slow dependency no longer paints its wait onto every consumer.
- A module's hook total counts overlapping runs once instead of summing them.
- A row whose spans sit entirely outside the zoom window shows a 2px edge tick instead of an empty track.

### Behavior changes

- A hook the dump gives no offset no longer renders on the class row; it still counts in its module's totals. Hook entries no longer carry `count`.
