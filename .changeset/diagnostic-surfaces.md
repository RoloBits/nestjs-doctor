---
"nestjs-doctor": minor
---

Add diagnostic surfaces, so a rule can be reported without moving the score.

`meta.surfaces` names where a rule's diagnostics may appear: `cli` for the
report, `score` for the 0-100 number, and `ciFailure` for `--blocking`.
Omitting it means all three, so every existing rule and every custom rule
behaves exactly as before.

`correctness/no-async-without-await` and `correctness/prefer-readonly-injection`
are now `["cli"]`. Measured across ten real NestJS repositories, those two were
52% of all output, and on one of them 148 of 251 findings. Both encode a
preference rather than a defect, and both were dragging every score that met
them. They still report in full, and they no longer fail a build.

Scores rise as a result. On the same ten repositories the change is between
0 and +12 points.

Every surface says which findings are report-only: the console appends
`· not scored`, the pull request comment marks the severity cell, and the HTML
report carries a badge beside the rule id plus an "N of M not scored" line
under the score, so the number and the issue count reconcile.
