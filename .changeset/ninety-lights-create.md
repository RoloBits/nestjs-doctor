---
"nestjs-doctor": minor
---

A scan now reports anonymous counts of which built-in rules fired, were
disabled, or threw, plus the score, file count, duration, platform, and how many
custom rules loaded. Rule ids come from the built-in set only: no code, no file
paths, no project name, and no custom rule names ever travel.

Reporting is best-effort and never blocks — it cannot change a score, a
diagnostic, or an exit code, and a scan that exits first simply loses the event.

`--no-telemetry` turns it off, as does `telemetry: false` in the config file or
`DO_NOT_TRACK=1` in the environment. The same flag also removes the HTML
report's beacon.
