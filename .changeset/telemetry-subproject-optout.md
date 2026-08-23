---
"nestjs-doctor": patch
"nestjs-doctor-lsp": patch
---

Honour a telemetry opt-out declared by a sub-project or sent by an editor that
only reports workspace folders.

Scanning a monorepo from its root read the root config alone, so
`telemetry: false` in one package was loaded, used to filter that package's
rules, and ignored when deciding whether to report. The language server had the
same gap from the other end: it took the project root from `rootUri` or
`rootPath`, both deprecated, and a client sending only `workspaceFolders` left
it empty, which skipped the config check entirely and hashed the editor's
working directory as the project.
