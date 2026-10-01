---
"nestjs-doctor": patch
---

A scan that collects no TypeScript files no longer prints a score of 100: every format says where it looked and how to point the scan at the project, writes no payload and exits 2, and the GitHub Action's check fails on a `directory` with no TypeScript files where it used to pass. A scan started by a coding agent with the skill installed reports `trigger: skill`, and `--init` and `ci install` report one `command_completed` event under the same opt-outs as the scan report.
