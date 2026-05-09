---
"nestjs-doctor-lsp": patch
---

Fix empty npm publish and missing bin shebang. `nestjs-doctor-lsp@0.1.0` and `0.1.1` shipped without compiled code (only `package.json` and `LICENSE`) because the LSP build was never run before `changeset publish`, and the bin entrypoint (`dist/server.cjs`) was missing a `#!/usr/bin/env node` shebang so editors couldn't spawn it via PATH. The LSP package now declares a `prepack` hook so `pnpm pack` always builds first, the root `build` script also covers the LSP, the bundler emits the shebang on the bin entry, and the package rejoins the normal Changesets release flow. Resolves #111.
