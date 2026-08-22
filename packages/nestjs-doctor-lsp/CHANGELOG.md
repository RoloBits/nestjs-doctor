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

### Patch Changes

- Updated dependencies [7230094]
- Updated dependencies [37de413]
- Updated dependencies [091f691]
- Updated dependencies [f02f780]
- Updated dependencies [f0811ec]
- Updated dependencies [b544041]
- Updated dependencies [56a536b]
- Updated dependencies [f92fb54]
- Updated dependencies [e86e189]
- Updated dependencies [0bdfbe4]
- Updated dependencies [418352d]
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
