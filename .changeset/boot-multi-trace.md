---
"nestjs-doctor": patch
---

### Added

- **One boot trace per entry point.** `--timings` takes a comma list of SerializedGraph dumps, each optionally labelled (`--timings api.json,worker=worker.json`). Every dump becomes its own trace on the Boot tab with a picker, keeping its own clock; the report attributes each dump to a monorepo project by its label, its root module against the bootstrap roots, or the modules only one project owns. The artifact gains an additive `graph.traces` array while the old singular fields keep mirroring the primary trace, so existing consumers read unchanged. In the modules graph, the trace dock is pinned to the selected module's own app and says so instead of showing another app's boot when none covers it; per-module timings attach per project, so two projects sharing a module class name no longer lose their timings.

### Behavior changes

- Node API: `buildReportArtifact` takes `traces` (`LoadedBootTrace[]`, exported from the api barrel) instead of the old `timings` input.
