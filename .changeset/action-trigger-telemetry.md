---
"nestjs-doctor": patch
---

Report how a CI scan was triggered, so the GitHub Action's own usage is
measurable.

The scan payload carried one bit about CI — `generated_in: "ci" | "cli"` — which
cannot tell the official action apart from a hand-rolled `npx nestjs-doctor`
step. Every scan now also reports the scope and blocking level the CLI resolved.
A scan in CI adds the triggering event and the CI provider, and
one from the action adds which of its comment, review-comment, commit-status and
SARIF inputs were on, how the version was pinned, and the pull request author's
association.

Every field is a boolean or a value from a fixed list; anything unrecognised is
dropped rather than forwarded, and the action's `version` input is classified as
`latest`, `pinned` or `local` so a local path never travels. No repository,
organization, or run identifier is added, and CI runs still share one identifier
per provider with no project id.

The action takes a `telemetry` input to turn it off, alongside `--no-telemetry`,
`telemetry: false` in the config, and `DO_NOT_TRACK`. The docs now describe what
a scan reports instead of summarising it as "anonymous rule counts", and
`--no-telemetry` appears in the CLI reference for the first time.
