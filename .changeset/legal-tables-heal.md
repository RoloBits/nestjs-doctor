---
"nestjs-doctor": patch
---

Turn on the anonymous rule-count reporting and the HTML report's beacon, both of
which shipped inert. `--no-telemetry`, `telemetry: false` in the config file, and
`DO_NOT_TRACK=1` each switch them back off.
