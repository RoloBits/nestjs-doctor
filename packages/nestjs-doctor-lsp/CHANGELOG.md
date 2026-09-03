# nestjs-doctor-lsp

## 4.1.2

### Patch Changes

- a773726: Print one line on the first console scan on a machine pointing at the VS Code extension and the `nestjs-doctor-lsp` language server, then never again, and never in CI, inside a coding agent, in a machine-readable format, off a TTY, or once the language server has run. The first-run telemetry notice is gone; [the telemetry page](https://nestjs.doctor/docs/telemetry) still documents every field and every opt-out.
- b67449e: `NESTJS_DOCTOR_TELEMETRY_DEBUG=1` prints the language server's telemetry payload to stderr and sends nothing.
- Updated dependencies [ddc6bed]
- Updated dependencies [04fdd28]
- Updated dependencies [bbbaf8c]
- Updated dependencies [04fdd28]
- Updated dependencies [0243a59]
- Updated dependencies [04fdd28]
- Updated dependencies [04fdd28]
- Updated dependencies [a773726]
- Updated dependencies [3d0a444]
- Updated dependencies [b67449e]
- Updated dependencies [b67449e]
- Updated dependencies [8e7dea5]
  - nestjs-doctor@0.9.6

## 4.1.1

### Patch Changes

- b0bc3c2: Fixes CI classification in telemetry for both the CLI and the language server. A shared `ci.<provider>` identity is now minted only when a known provider variable matches; a bare `CI` env var keeps the personal install id (the CLI records `ci_provider: "unknown"`) instead of merging the run into an anonymous machine pool. The provider table expands from 6 to 34 systems (TeamCity, Azure Pipelines, Bitbucket Pipelines, CodeBuild, Drone, Render, and others), so automated runners that set none of the previous variables are no longer counted as individual users.
- Updated dependencies [e840d6d]
- Updated dependencies [b0bc3c2]
- Updated dependencies [2097f58]
- Updated dependencies [6372d3c]
- Updated dependencies [961edce]
- Updated dependencies [71c7368]
- Updated dependencies [64c83fd]
- Updated dependencies [c447f85]
- Updated dependencies [a32085a]
- Updated dependencies [abc731f]
  - nestjs-doctor@0.9.1

## 4.1.0

### Changed

- Findings that cannot affect the score or fail a build now surface as hints instead of warnings, matching diagnostic surfaces in `nestjs-doctor@0.9.0`.

### Added

- Rescans when a `package.json` changes, so security-advisory findings appear and clear as dependencies change — no editor restart needed.

### Fixed

- Windows: findings did not attach to any file because paths with a drive prefix (`D:/proj/...`) were treated as relative.
- Windows: findings duplicated after the first edit because two caches keyed the same path differently.

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
