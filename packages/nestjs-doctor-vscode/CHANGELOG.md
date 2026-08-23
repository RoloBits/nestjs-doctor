# Changelog

## 0.1.4

### Patch Changes

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

- 6d56fc1: Fix the packaged extension being able to ship a stale language server. The
  build copies `server.cjs` and `scan-worker.cjs` out of the LSP package but
  never declared it as a dependency, so pnpm ran the two builds in parallel. A
  clean checkout failed outright and a warm one copied whatever the previous
  build left behind. It is a workspace dependency now, so the order is fixed.

  The extension also no longer ships its own packaging check inside the vsix.

- 7bb9093: Watch `package.json` so dependency findings refresh.

  The client registered file watchers for TypeScript sources only, so editing a
  dependency left every advisory finding as it was until the window reloaded. It
  now watches `**/package.json` and the server rescans on the change.

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
