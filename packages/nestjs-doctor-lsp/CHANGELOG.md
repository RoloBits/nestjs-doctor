# nestjs-doctor-lsp

## 5.0.0

### Minor Changes

- f0811ec: Add diagnostic surfaces, so a rule can be reported without moving the score.

  `meta.surfaces` names where a rule's diagnostics may appear:

  | Surface     | Where                                                                                                                |
  | ----------- | -------------------------------------------------------------------------------------------------------------------- |
  | `cli`       | The console report and the HTML report                                                                               |
  | `prComment` | The pull request summary, its inline review comments, the GitHub annotations, `--format sarif` and `--format gitlab` |
  | `score`     | The 0-100 number                                                                                                     |
  | `ciFailure` | `--blocking`                                                                                                         |

  Omitting it means all four, so every existing rule and every custom rule
  behaves exactly as before. `--format json` still carries every finding, with
  `surfaces` on each one, so a consumer filters however it wants.

  `correctness/no-async-without-await` and `correctness/prefer-readonly-injection`
  are now `["cli"]`. Measured across ten real NestJS repositories, those two were
  52% of all output, and on one of them 148 of 251 findings. Both encode a
  preference rather than a defect, and both were dragging every score that met
  them. They still report every finding in the console and the HTML report, and
  they no longer comment on a pull request or fail a build.

  Scores rise as a result. On the same ten repositories the change is between
  0 and +12 points.

  The console appends `· not scored` to a finding that does not reach the score.
  The HTML report carries a badge beside the rule id, an `N of M not scored` line
  under the score so the two numbers reconcile, and a **Show not scored**
  checkbox that starts off.

  Surfaces are configurable. `"rules": { "<id>": { "surfaces": [...] } }`
  replaces what a rule declares, so a team that does want a style enforced can
  put it back on the score and the build. A value that is not a list of known
  surface names is ignored rather than applied, so a typo cannot quietly narrow
  what gets reported.

  In the editor, a finding that can neither score nor fail a build is reported as
  a hint rather than a warning, so it stays visible while you write without
  sitting in the Problems panel beside real defects.

  `DiagnosticSurface`, `BaseDiagnostic`, `onSurface` and `forSurface` are
  exported, so a custom rule can declare surfaces and a consumer can read them.

  Two Windows fixes for the editor ride along, both older than this change.

  The language server decided a path was absolute by testing for a leading
  slash. Nothing the scanner reports on Windows has one, because ts-morph uses
  forward slashes with a drive, so `D:/proj/src/a.ts` was appended to the
  workspace root anyway and became `D:\proj/D:/proj/src/a.ts`. That points at no
  file, so every finding attached to nothing.

  The worker also kept one diagnostic cache written from two sources that spell
  a path differently: a full scan keys by the scanner's path, an edit keys by the
  document URI converted to a native one. They agree everywhere except Windows,
  where the first edit added a second entry for the same file, so each finding
  appeared twice and the set from before the edit never cleared.

- 0c09973: The language server reports one anonymous event when an editor connects, naming
  the editor from the LSP `clientInfo` so Vim, Helix and Emacs sessions are
  counted the same way VS Code's are. One event per session, never per request.

  It reuses the install id the CLI already writes, so a developer who scans in a
  terminal and edits in an editor is one person with two surfaces rather than two
  people.

  `DO_NOT_TRACK` and `telemetry: false` in the project's config both stop it. The
  VS Code extension passes `env.isTelemetryEnabled` through `initializationOptions`,
  so a user who turns telemetry off in their editor settings stops the server
  reporting too.

### Patch Changes

- 7bb9093: Rescan when a `package.json` changes.

  The server watched TypeScript sources only, so a dependency edit left every
  advisory finding as it was until the editor restarted. Bumping a package out of
  a vulnerable range cleared nothing, and adding a vulnerable one showed nothing.
  The client now registers a `**/package.json` watcher and the server runs a full
  scan on the change.

- 540fd52: Point the npm `homepage` field at the docs site and widen the registry keywords.

  `nestjs-doctor` sent its homepage link back to the GitHub readme, so the most
  authoritative page linking to the project skipped the docs site entirely, and
  `nestjs-doctor-lsp` carried no homepage at all. Both now link to the docs. The
  keyword lists gain the terms people actually search for — `static-analysis`,
  `module-graph`, `dependency-graph`, `circular-dependency`, `code-quality` — and
  drop `health-check`, which collides with `@nestjs/terminus` health endpoints and
  attracts the wrong query.

- 0c09973: Stop sending a project id from CI.

  The id was a SHA-256 of the checkout path under a salt that shipped inside the
  published package. A runner's path is a fixed template, so the digest was
  reversible to a repository name with a wordlist, which is the dictionary attack
  the salted id existed to prevent. CI runs now report only the per-provider id.
  A local scan is unaffected: its salt is random per machine and never leaves it.

- 0c09973: Honour a telemetry opt-out declared by a sub-project or sent by an editor that
  only reports workspace folders.

  Scanning a monorepo from its root read the root config alone, so
  `telemetry: false` in one package was loaded, used to filter that package's
  rules, and ignored when deciding whether to report. The language server had the
  same gap from the other end: it took the project root from `rootUri` or
  `rootPath`, both deprecated, and a client sending only `workspaceFolders` left
  it empty, which skipped the config check entirely and hashed the editor's
  working directory as the project.

- Updated dependencies [6261fa9]
- Updated dependencies [7bb9093]
- Updated dependencies [7230094]
- Updated dependencies [0c09973]
- Updated dependencies [37de413]
- Updated dependencies [091f691]
- Updated dependencies [f02f780]
- Updated dependencies [db966da]
- Updated dependencies [ba77aa5]
- Updated dependencies [0c09973]
- Updated dependencies [0c09973]
- Updated dependencies [f0811ec]
- Updated dependencies [b544041]
- Updated dependencies [0c09973]
- Updated dependencies [e31153d]
- Updated dependencies [339f80b]
- Updated dependencies [ec00e20]
- Updated dependencies [a1c6317]
- Updated dependencies [ba77aa5]
- Updated dependencies [38eb780]
- Updated dependencies [56a536b]
- Updated dependencies [f92fb54]
- Updated dependencies [7bb9093]
- Updated dependencies [7bb9093]
- Updated dependencies [7bb9093]
- Updated dependencies [ee09c74]
- Updated dependencies [0c09973]
- Updated dependencies [1ab1256]
- Updated dependencies [0c09973]
- Updated dependencies [e86e189]
- Updated dependencies [540fd52]
- Updated dependencies [0bdfbe4]
- Updated dependencies [540fd52]
- Updated dependencies [7bb9093]
- Updated dependencies [418352d]
- Updated dependencies [d3c440a]
- Updated dependencies [1ab1256]
- Updated dependencies [0c09973]
- Updated dependencies [0c09973]
- Updated dependencies [8006d2e]
  - nestjs-doctor@0.9.0

## 4.0.0

### Patch Changes

- Updated dependencies [a2bb0dd]
  - nestjs-doctor@0.8.0

## 3.0.0

### Patch Changes

- Updated dependencies [7157408]
- Updated dependencies [faa9f28]
- Updated dependencies [38ec6dd]
- Updated dependencies [2bdc2c9]
  - nestjs-doctor@0.7.0

## 2.0.1

### Patch Changes

- 293fa1d: Rebuild against nestjs-doctor 0.6.1, picking up the guard and module-boundary
  detection fixes so editor diagnostics match the CLI's.

## 2.0.0

### Patch Changes

- Updated dependencies [7fc03e8]
- Updated dependencies [41eaa2a]
- Updated dependencies [76e5f09]
- Updated dependencies [7fc03e8]
  - nestjs-doctor@0.6.0

## 1.0.0

### Patch Changes

- Updated dependencies [11bb016]
  - nestjs-doctor@0.5.0

## 0.1.2

### Patch Changes

- 9676def: Fix empty npm publish and missing bin shebang. `nestjs-doctor-lsp@0.1.0` and `0.1.1` shipped without compiled code (only `package.json` and `LICENSE`) because the LSP build was never run before `changeset publish`, and the bin entrypoint (`dist/server.cjs`) was missing a `#!/usr/bin/env node` shebang so editors couldn't spawn it via PATH. The LSP package now declares a `prepack` hook so `pnpm pack` always builds first, the root `build` script also covers the LSP, the bundler emits the shebang on the bin entry, and the package rejoins the normal Changesets release flow. Resolves #111.
