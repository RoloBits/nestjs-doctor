---
"nestjs-doctor": patch
---

Fix a monorepo's root config being silently ignored by every sub-project.

`loadConfigWithFallback` only fell back to the root config when `loadConfig`
threw, but `loadConfig` swallows a missing file and returns the defaults — so a
root `nestjs-doctor.config.json` (or one passed via `--config`) was loaded and
then dropped for each sub-project. A sub-project that ships its own config still
takes precedence; one that ships none now inherits the root's.

Closes #109.
