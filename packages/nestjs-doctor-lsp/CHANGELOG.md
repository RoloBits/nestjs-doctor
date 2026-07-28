# nestjs-doctor-lsp

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
