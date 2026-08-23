---
"nestjs-doctor": patch
---

A console scan in a terminal now ends with a menu: open the HTML report built from the scan that just ran, scaffold the GitHub Actions workflow when it is missing, or copy the findings as markdown. The menu is skipped in CI, inside coding agents, in pipes, and in every machine-readable mode, and quitting keeps the run's exit code. Opening a report from the browser no longer holds the process open, and the Windows open command quotes the path correctly.
