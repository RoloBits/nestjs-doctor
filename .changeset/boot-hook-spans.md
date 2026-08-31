---
"nestjs-doctor": patch
---

### Fixed

- A transient provider's lifecycle hooks were merged into one offsetless total and drew as a `+11ms init ×2` chip beside the class name. Each run now keeps its own `startMs` and draws as its own span on the timeline. The chip rendering is gone.

### Behavior changes

- A hook the dump gives no offset no longer renders on the class row; it still counts in its module's totals. Hook entries no longer carry `count`.
