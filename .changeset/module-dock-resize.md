---
"nestjs-doctor": patch
---

### Fixed

- **Graph no longer cut after closing the bottom drawer.** The canvas measured its size before the drawer's open or close landed in the DOM, so closing left the graph painted at the shrunken height. It now resizes after the state commits.
