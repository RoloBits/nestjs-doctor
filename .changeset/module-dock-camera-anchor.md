---
"nestjs-doctor": patch
---

### Fixed

- **Graph no longer drifts when the bottom drawer opens or closes.** The draw transform scales around the canvas centre, so any height change shifted content by half the delta times the zoom factor. The camera now compensates on resize and every node keeps its screen position.
