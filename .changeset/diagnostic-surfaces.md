---
"nestjs-doctor": minor
"nestjs-doctor-lsp": minor
---

Add diagnostic surfaces, so a rule can be reported without moving the score.

`meta.surfaces` names where a rule's diagnostics may appear:

| Surface | Where |
| --- | --- |
| `cli` | The console report and the HTML report |
| `prComment` | The pull request summary, its inline review comments, the GitHub annotations, `--format sarif` and `--format gitlab` |
| `score` | The 0-100 number |
| `ciFailure` | `--blocking` |

Omitting it means all four, so every existing rule and every custom rule
behaves exactly as before. `--format json` still carries every finding, with
`surfaces` on each one, so a consumer filters however it wants.

`correctness/no-async-without-await` and `correctness/prefer-readonly-injection`
are now `["cli"]`. Measured across ten real NestJS repositories, those two were
52% of all output, and on one of them 148 of 251 findings. Both encode a
preference rather than a defect, and both were dragging every score that met
them. They still report every finding in the console and the HTML report, and
they no longer comment on a pull request or fail a build.

Scores rise as a result. On the same ten repositories the change is between
0 and +12 points.

The console appends `· not scored` to a finding that does not reach the score.
The HTML report carries a badge beside the rule id, an `N of M not scored` line
under the score so the two numbers reconcile, and a **Show not scored**
checkbox that starts off.

Surfaces are configurable. `"rules": { "<id>": { "surfaces": [...] } }`
replaces what a rule declares, so a team that does want a style enforced can
put it back on the score and the build. A value that is not a list of known
surface names is ignored rather than applied, so a typo cannot quietly narrow
what gets reported.

In the editor, a finding that can neither score nor fail a build is reported as
a hint rather than a warning, so it stays visible while you write without
sitting in the Problems panel beside real defects.

`DiagnosticSurface`, `BaseDiagnostic`, `onSurface` and `forSurface` are
exported, so a custom rule can declare surfaces and a consumer can read them.
