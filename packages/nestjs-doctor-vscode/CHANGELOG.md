# Changelog

## 0.1.4

### Patch Changes

- 6d56fc1: Fix the packaged extension being able to ship a stale language server. The
  build copies `server.cjs` and `scan-worker.cjs` out of the LSP package but
  never declared it as a dependency, so pnpm ran the two builds in parallel. A
  clean checkout failed outright and a warm one copied whatever the previous
  build left behind. It is a workspace dependency now, so the order is fixed.

  The extension also no longer ships its own packaging check inside the vsix.

Entries from 0.1.4 on are written by changesets. The three below it were
reconstructed from commit history, from when the version was bumped by hand.

## 0.1.3

- Republished against the current engine.

## 0.1.2

- Fix an LSP crash, a status bar spinner that hung, and worker recovery.
- Align the debounce default to 200ms across the extension and the server.

## 0.1.1

- Packaging and marketplace metadata.

## 0.1.0

- Initial release
- Inline diagnostics powered by `nestjs-doctor` LSP
- Problems panel integration
- Status bar health score
- Scan on save, scan on open, manual scan command
- Configurable debounce delay
