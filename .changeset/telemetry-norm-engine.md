---
"nestjs-doctor": patch
---

Report a CI scan as `ci.<provider>.<hash>`, a one-way digest of the runner's numeric repository id (`GITHUB_REPOSITORY_ID`, `CI_PROJECT_ID`), instead of one shared anonymous id per provider; it is never derived from the repository name, path, remote URL or commit sha. `NESTJS_DOCTOR_TELEMETRY_DEBUG=1` prints the exact scan payload to stderr and sends nothing, and the `--telemetry` help and the Action's `telemetry` input name every opt-out.
