---
"nestjs-doctor": patch
"nestjs-doctor-lsp": minor
"nestjs-doctor-vscode": patch
---

The language server reports one anonymous event when an editor connects, naming
the editor from the LSP `clientInfo` so Vim, Helix and Emacs sessions are
counted the same way VS Code's are. One event per session, never per request.

It reuses the install id the CLI already writes, so a developer who scans in a
terminal and edits in an editor is one person with two surfaces rather than two
people.

`DO_NOT_TRACK` and `telemetry: false` in the project's config both stop it. The
VS Code extension passes `env.isTelemetryEnabled` through `initializationOptions`,
so a user who turns telemetry off in their editor settings stops the server
reporting too.
