---
"nestjs-doctor-vscode": patch
---

Fix the packaged extension being able to ship a stale language server. The
build copies `server.cjs` and `scan-worker.cjs` out of the LSP package but
never declared it as a dependency, so pnpm ran the two builds in parallel. A
clean checkout failed outright and a warm one copied whatever the previous
build left behind. It is a workspace dependency now, so the order is fixed.

The extension also no longer ships its own packaging check inside the vsix.
