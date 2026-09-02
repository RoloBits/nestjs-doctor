---
name: nestjs-doctor
description: Use after writing or changing NestJS code, before committing, when a nestjs-doctor check fails in CI, or when the user asks to scan, audit, review, or clean up a Nest project, or mentions circular modules, unused providers, a missing guard, an ORM leaking into a controller, or a slow boot. Runs a deterministic 52-rule scan over security, correctness, architecture, performance, and database schema, then fixes what it finds.
allowed-tools: Bash, Read, Edit, Glob, Grep, Write
---

# nestjs-doctor

> v0.0.0

The deterministic NestJS devtool that catches AI mistakes.

52 rules over security, correctness, architecture, performance, and database
schema, scored 0-100. No model at scan time and nothing about your code leaves
the machine, so the same
commit scores the same on a laptop and in CI.

## After changing NestJS code

Report only what the change introduced:

```bash
NESTJS_DOCTOR_TRIGGER=skill npx nestjs-doctor@latest . --scope changed --base origin/main --verbose
```

Fix anything new before committing.

The whole project is analysed either way. Narrowing the scope narrows the
report, never the analysis, so a change that breaks a cross-file rule is caught
even when the file it is reported against was never touched.

`--scope changed` needs a git repository and the base commit present in the
checkout. Without either it widens the report and says so on stderr, rather
than going quiet and looking clean.

## Auditing a whole project

```bash
NESTJS_DOCTOR_TRIGGER=skill npx nestjs-doctor@latest . --verbose
```

Work down by severity: errors, then warnings, then info. Security and
correctness weigh most in the score, performance least.

Some rules are report-only. They are listed with everything else but never
comment on a pull request, move the score, or fail a build, so fixing one moves
no number. Fix it because the code reads better, not to raise the score. A
project can put one back with `"rules": { "<id>": { "surfaces": [...] } }`.

## Fixing a finding

Every diagnostic carries a rule id and a `help` line naming the fix. Apply it in
the smallest place that resolves it, then re-run the same command and confirm
the finding is gone and nothing new appeared.

A `schema/*` finding names an entity rather than a line, because those three
rules report against the model instead of a file position.

Never suppress a finding to move the number. The score is only worth something
while it reflects the code.

## When a rule is wrong for this project

Reach for the narrowest control that works, in this order:

1. One line: `// nestjs-doctor-ignore-next-line <rule-id>` above it.
2. One file: `// nestjs-doctor-ignore-file <rule-id>` at the top.
3. One rule everywhere: `"rules": { "<rule-id>": false }` in
   `nestjs-doctor.config.json`.
4. A whole category: `"categories": { "performance": false }`.

Config lives in `nestjs-doctor.config.json`, `.nestjs-doctor.json`, or a
`"nestjs-doctor"` key in `package.json`. The loader reads JSON only and uses
whichever it finds first, whole.

There is no severity override. `severity` is declared in the config type and no
engine code reads it, so setting it changes nothing.

## Machine-readable output

```bash
NESTJS_DOCTOR_TRIGGER=skill npx nestjs-doctor@latest . --json
```

`--json`, `--score`, and `--format report-json|sarif|gitlab|markdown` default
`--blocking` to `none`, so they report without failing. The console report and
`--format github` default to `error`. Pass `--blocking` explicitly whenever the
exit code matters.

Two warnings are suppressed entirely in those modes rather than sent to stderr:
a custom rule that failed to load, and a run below `--min-score`. Under `--json`
a min-score failure exits 1 with no message on either stream.

## Continuous integration

```bash
NESTJS_DOCTOR_TRIGGER=skill npx nestjs-doctor@latest ci install
```

Writes `.github/workflows/nestjs-doctor.yml`, which reviews each pull request
against its base branch. It comments and sets a status but never fails until
`blocking` or `min-score` is set. Only `pull_request` events are gated; every
other event scans the whole project and exits 0.

## A slow boot

Construction times need a real boot, which a scan never performs. Use the
`nestjs-boot-trace` skill.

## Flags

| Flag | Purpose |
| ---- | ------- |
| `--scope changed` | Report only what the change introduced |
| `--base <ref>` | The branch or commit to compare against |
| `--staged` | Report on the files in the git index |
| `--verbose` | Show the file and line behind every finding |
| `--json` | The full result, for tooling |
| `--score` | The number alone |
| `--report` | Write an interactive HTML report |
| `--format report-json` | Write the document behind that report as versioned JSON |
| `--output <path>` | Where to write it, instead of the project root |
| `--timings <path>` | Overlay real boot times on the report |
| `--sources <mode>` | Report source text: all (default), touched, none |
| `--share-sections <csv>` | Write a shareable JSON slice: score, endpoints, schema, modules, findings:<category> |
| `--share-code` | With `--share-sections`, include code around each shared finding |
| `--min-score <n>` | Fail below a score |
| `--blocking <level>` | Fail on `error`, `warning`, or never with `none` |
| `--config <path>` | Use a specific config file |
| `--list-rules` | Print every built-in rule and exit |
