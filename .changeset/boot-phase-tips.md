---
"nestjs-doctor": patch
---

### Fixed

- A phase in the boot trace's overview lane shorter than its label had no name: a 0.7ms `opening the port` drew as a 2px sliver, so the lane read as ending with the hooks. Every phase now carries a hover tip with its time and meaning, and no phase draws narrower than 0.6% of the lane.
