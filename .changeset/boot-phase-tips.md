---
"nestjs-doctor": patch
---

### Fixed

- A phase in the boot trace's overview lane shorter than its label had no name: a 0.7ms `opening the port` drew as a 2px sliver, so the lane read as ending with the hooks. Every phase now carries a hover tip with its time and meaning, and no phase draws narrower than 0.6% of the lane. A phase nothing ran inside draws as a black weave, at least 8% of the lane wide, so an empty `bootstrap hooks` or a sub-millisecond `listen` still reads as a section. Both floors scale down together on a lane too narrow to fit them. Each phase label stacks the name over the time, so both stay readable inside a narrow column.
