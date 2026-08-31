---
"nestjs-doctor": patch
---

### Fixed

- A transient provider's lifecycle hooks were merged into one offsetless total and drew as a `+11ms init ×2` chip beside the class name. Each run now keeps its own `startMs` and draws as its own span on the timeline. The chip rendering is gone.

- The module detail panel's hook chips are gone too; the panel keeps its `build · init` summary line.
- A class that finishes within a millisecond of its slowest dependency keeps its own finish with no width, and a controller clocked from its module's later load start draws after that dependency instead of at boot start, so a shared slow dependency no longer paints its wait onto every consumer.
- A module's hook total counts overlapping runs once instead of summing them.
- A row whose spans sit entirely outside the zoom window shows a 2px edge tick instead of an empty track.
- A phase whose bars cover less than 95% of it says so on its label (`building modules 130ms · 80ms in classes`) and on its tip, matching how tracers state self time.
- The init and bootstrap segments split without a `moduleInitMs` marker: the parser derives the boundary from the first `onApplicationBootstrap` start, falling back to the last `onModuleInit` end.
- Middleware nodes are timed during `app.init()`, so they no longer draw inside `building modules`; they are left out of the trace.
- A phase between two coincident markers (`createMs === moduleInitMs`) had no width, so the next segment painted over it: invisible, no tip, dead click. The overview lane now tiles the boot instead of positioning each segment independently — no segment overlaps its neighbour, the last one ends where the boot ends, and a segment widened past its true share carries dashed edges and says so on its tip. A zero-length phase reads `0ms`, draws as a weave, and zooms to a slice of the boot around its instant when clicked.

### Behavior changes

- A hook the dump gives no offset no longer renders on the class row; it still counts in its module's totals. Hook entries no longer carry `count`.
