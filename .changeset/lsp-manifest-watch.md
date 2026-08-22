---
"nestjs-doctor-lsp": patch
---

Rescan when a `package.json` changes.

The server watched TypeScript sources only, so a dependency edit left every
advisory finding as it was until the editor restarted. Bumping a package out of
a vulnerable range cleared nothing, and adding a vulnerable one showed nothing.
The client now registers a `**/package.json` watcher and the server runs a full
scan on the change.
