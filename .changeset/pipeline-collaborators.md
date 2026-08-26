---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the scan pipeline's cancellation
watching, worker-thread delegation, and telemetry reporting moved from
methods on the pipeline base class into their own modules
(src/cli/cancellation-watcher.ts, src/cli/worker-delegate.ts,
src/cli/scan-telemetry-reporter.ts), each covered by its own tests.
