---
"nestjs-doctor": patch
---

### Highlights

- **Boot trace tab** — `--timings` gets its own tab: every class at its real offset from boot start on one absolute axis, grouped by module and colored by type, with the lifecycle phases above the rows carrying the viewport window. Scroll to zoom, drag the axis to pan, click a phase to frame it.
- **Dependency cascades** — a class row opens level by level into what it waited on. A class already costed above reappears as a `deduped` shadow, and selecting the shadow jumps to its own row.
- **Hover card** — one card follows the pointer over a bar or a hook span, on a diagonal tether, with the class, what it waited on, its module and type, and its time.
- **Modules graph** — nodes show `build` and hook time on separate lines (`104ms build`, `63ms init`) instead of one raw number. The dock keeps a compact mount of the trace, and selecting a class there selects its module on the graph and back.

### Behavior changes

- The header `time to start` badge and the phase strip are gone; the tab's overview lane carries the phases.
- Hook timings render as spans at their real offset when the dump carries `startMs`, which the documented `main.ts` snippet now records. Older dumps keep the `+120ms init` chips.
- `nestjs-doctor/report-ui` exports `renderBoot` and `focusBootTrace` in place of `jumpToSlowestBoot`.

### Fixed

- A module node showed its slowest class's raw `initTime`, which included time spent waiting on dependencies: `DatabaseModule · 142ms` was `104ms build` plus `63ms init` after 38ms waiting on `ConfigService`.
- Collapsing a module group in the trace dock toggled a class and hid nothing.
