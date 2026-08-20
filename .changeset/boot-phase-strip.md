---
"nestjs-doctor": minor
---

Segment the boot timeline in the report's Boot trace tab. The documented snippet now stamps `createMs` and `initMs` (via an explicit `app.init()`) alongside `startupMs`; the tab tops with a lifecycle strip — `create · lifecycle hooks · listen`, or four segments when `moduleInitMs` is present — and the header badge tooltip carries the same caption. Out-of-order markers drop the whole breakdown with one stderr warning rather than render a wrong bar.

An optional `instrument.instanceDecorator` wrapper (Nest 11+, documented) records per-class `onModuleInit`/`onApplicationBootstrap` durations as `hookTimings`; they render as `+<ms> init` / `+<ms> bootstrap` chips on trace rows and module headers, joined only when the class name is unique in the dump. Old dumps render exactly as before.
