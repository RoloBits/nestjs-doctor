---
"nestjs-doctor-vscode": patch
---

Watch `package.json` so dependency findings refresh.

The client registered file watchers for TypeScript sources only, so editing a
dependency left every advisory finding as it was until the window reloaded. It
now watches `**/package.json` and the server rescans on the change.
