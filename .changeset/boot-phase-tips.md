---
"nestjs-doctor": patch
---

### Fixed

- A phase in the boot trace's overview lane shorter than its label had no name: a 0.7ms `opening the port` drew as a 2px sliver, so the lane read as ending with the hooks. Every phase now carries a hover tip with its time and meaning, and no phase draws narrower than 0.6% of the lane. A phase nothing ran inside draws as a black weave, at least 8% of the lane wide, so an empty `bootstrap hooks` or a sub-millisecond `listen` still reads as a section. Both floors scale down together on a lane too narrow to fit them. Each phase label stacks the name over the time, so both stay readable inside a narrow column.
- The overview lane and the axis spanned the rows' scrollbar, so a phase edge sat a few pixels right of its guide in the rows; the lanes now reserve the same scrollbar gutter as the rows (`scrollbar-gutter: stable` on both), so the two stay aligned in every context, including the modules graph's trace dock, which mounts hidden. Each handover guide is 2px wide and carries the boundary's time in the phase's color, pinned near the top while the rows scroll.
