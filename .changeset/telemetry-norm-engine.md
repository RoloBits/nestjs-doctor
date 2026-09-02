---
"nestjs-doctor": minor
---

Bring scan telemetry up to the norm other JS CLIs follow.

A scan run in CI now reports as `ci.<provider>.<hash>`, where the hash is a one-way digest of the numeric repository id the runner provides (`GITHUB_REPOSITORY_ID`, or `CI_PROJECT_ID` on GitLab). Every run of one repository counted as one anonymous install before, and every repository in CI shared a single id per provider. The salt ships in the package, so this id is pseudonymous rather than anonymous: it is derived from an opaque number, never from the repository name, the checkout path, a remote URL, or a commit sha, and no project id is sent from CI.

`NESTJS_DOCTOR_TELEMETRY_DEBUG=1` prints the exact scan payload to stderr and sends nothing, so what a scan reports can be read before it leaves the machine.

The `--telemetry` help text and the GitHub Action's `telemetry` input now name all three opt-outs, the debug variable, and the repository hash.
