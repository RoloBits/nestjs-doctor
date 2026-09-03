# Changelog

## 0.1.5

### Patch Changes

- Lead the marketplace description and the README with the tagline the rest of the project uses.

## 0.1.4

### Fixed

- Packaging could ship a stale language server: clean builds failed outright and warm builds copied whatever was left behind. The LSP package is a declared dependency now, so build order is fixed.
- Editing `package.json` now refreshes security-advisory findings without reloading the window (watches `**/package.json`).

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
