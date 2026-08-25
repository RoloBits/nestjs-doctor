---
"nestjs-doctor": minor
---

Report artifact: `--format report-json` writes the document the HTML report
embeds — score, findings, summary, module graph, providers, endpoints, schema,
rule examples, and source text — as versioned JSON (`schemaVersion: 1`) for
another tool to load. It writes `nestjs-doctor-report.json` beside the scanned
project or wherever `--output` points, and `--timings` now works with it.

The new `--sources` flag controls how much source text a report carries:
`all` (default), `touched` (only files with findings), or `none`. It applies to
both the HTML report and the artifact.

The Node API exports `ReportArtifact`, `REPORT_ARTIFACT_VERSION`, its
sub-types, and `buildReportArtifact`.
