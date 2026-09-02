---
"nestjs-doctor": patch
"nestjs-doctor-lsp": patch
---

The first console scan on a machine now prints one line pointing at the VS Code extension and the `nestjs-doctor-lsp` language server, then never again. It is never printed in CI, inside a coding agent, in a machine-readable format, when stderr is not a TTY, once the language server has already run, or on a machine where the marker could not be written.

The first-run telemetry notice is gone. It printed the same once-per-install line budget on a message nobody had asked for; [the telemetry page](https://nestjs.doctor/docs/telemetry) still documents every field and every opt-out.
