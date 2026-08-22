---
"nestjs-doctor": minor
---

Report `@nestjs/*` versions with a published security advisory.

Two rules, because a rule carries one severity and a critical sandbox escape
does not deserve the same weight as a moderate disclosure:

| Rule | Severity | Reports |
| --- | --- | --- |
| `security/no-vulnerable-nestjs-packages` | error | critical and high advisories |
| `security/nestjs-package-advisory` | warning | moderate and low advisories |

Both compare the versions your `package.json` declares against a table that
ships with the CLI, so a scan still makes no network call and the same project
scores the same on a laptop, in CI, and offline. The cost is that the table is
only as fresh as the release; `npx nestjs-doctor@latest` always knows the most.

Four advisories are covered today, taken from the GitHub Advisory Database
rather than written from memory: CVE-2025-54782 in `@nestjs/devtools-integration`
(critical), CVE-2026-35515 and CVE-2023-26108 in `@nestjs/core`, and
CVE-2024-29409 in `@nestjs/common`.

A range is read at its floor, the oldest version it still allows, which is what
a fresh install without a lockfile produces. `workspace:*` and any range with no
version in it are skipped rather than guessed at.

Worth knowing before you upgrade: the `@nestjs/core` advisory covers every
version up to 11.1.17 and is patched in 11.1.18, so a project on the 10.x line
is reported with no 10.x release to move to. It reports as a warning, not an
error, so it does not fail a build that was passing.
