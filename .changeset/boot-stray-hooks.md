---
"nestjs-doctor": patch
---

### Fixed

- A lifecycle hook whose recorded offset falls outside the phase its kind names kept blending in as if nothing were wrong. It keeps its measured position and the range sums it sits in, and now wears a striped marker with `past its phase` on its hover card. A framework-driven boot cannot produce this ordering (`app.init()` awaits every hook before resolving); it appears when user code re-invokes a hook after init.
