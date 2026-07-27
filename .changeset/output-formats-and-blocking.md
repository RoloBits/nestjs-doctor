---
"nestjs-doctor": minor
---

Add SARIF, GitLab Code Quality, markdown, and GitHub Actions output, plus a
configurable failure gate.

`--format console|json|sarif|gitlab|markdown|github` selects the output shape,
`--output <path>` writes it to a file, and `--json-compact` drops the
indentation from the JSON-based formats. SARIF results carry explicit
`partialFingerprints`, so a GitHub code-scanning alert survives an edit near the
finding instead of being closed and reopened. `github` is additive: it prints
workflow annotations and appends the report to the job summary while keeping the
readable console output.

`--blocking none|warning|error` sets the severity that fails the run,
independently of `--min-score`. The defaults reproduce existing behaviour
exactly — `error` for the console report, `none` for `--json` and `--score`,
which previously failed only on `--min-score`. Passing `--blocking` explicitly
makes every output mode behave the same.

`--list-rules` prints the built-in rule catalogue (add `--json` for a
machine-readable list).

The markdown, SARIF, and GitLab builders are exported from the public API as
`buildMarkdownReport`, `buildSarifLog`, and `buildCodeQualityReport`, alongside
the diff-scoping and fingerprint helpers.

Warnings and errors about the run itself now go to stderr, so stdout stays a
clean machine-readable stream.
