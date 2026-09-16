---
"nestjs-doctor": minor
---

A scan that collects no TypeScript files no longer prints a score of 100. Every format prints where it looked and how to point the scan at the project, writes no payload, and exits 2; the GitHub Action's pull request check now fails on a `directory` that holds no TypeScript files, where it used to pass with 100. The post-scan menu gains "Run after every change (install the agent skill)", which runs the same install as `--init` and is hidden once every detected agent carries this version's skill. A scan started by a coding agent that has the nestjs-doctor skill installed reports `trigger: skill`, a new value that tells it apart from an agent running the CLI on its own, and `--init` and `ci install` report one `command_completed` event under the same opt-outs as the scan report.
