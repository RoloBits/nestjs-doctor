---
"nestjs-doctor": patch
---

A config file that will not parse now fails the scan instead of being ignored.

`findConfig` caught every error from reading a config, so a
`nestjs-doctor.config.json` with a trailing comma or a comment was
indistinguishable from one that did not exist. The scan then ran on defaults:
`minScore` was dropped, so a gate set to 90 passed silently; `ignore` was
dropped, so suppressed rules reappeared; and `telemetry: false` was dropped, so
a project that had opted out was reported. Only a missing file is treated as an
absence now, and a broken one prints which file and why, then exits 2. Passing
the same file through `--config` already behaved this way, so the two paths
agree again.
