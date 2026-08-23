---
"nestjs-doctor": minor
---

Reporting uses a stable anonymous install id kept in a config file, instead of a
fresh id per scan, so counts reflect people rather than how often each person
runs the CLI. Alongside it the file holds a random salt that never leaves the
machine, used to hash the project's path into a `project_id` — two installs
scanning the same path produce different ids, and the path cannot be recovered
from either.

CI runs report as one id per provider (`ci.github`, `ci.gitlab`, …) rather than
minting a user per runner.

`NESTJS_DOCTOR_CONFIG_DIR` overrides where the file lives, on every platform.
Test runs never report: `VITEST` or `NODE_ENV=test` disables it outright.
