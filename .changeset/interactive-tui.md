---
"nestjs-doctor": minor
---

Interactive runs now end on a full-screen score and action panel, and "Review issues" opens a live two-pane browser: the findings list on the left, and a side panel on the right that follows the selection with the code window, the rule's recommendation, its bad/good sample pair, and the docs link. Navigation is by key (`↑↓` findings, `←→` rule groups, `c` copy fix prompt, `o` docs, `b` back), replacing the prompt-by-prompt menu. The visual language matches the site and HTML report: black surfaces, hairline borders, nest-red selection rail, severity red/amber/blue. The screen is skipped where it could hang — CI, coding agents, pipes, dumb terminals — exactly as before.
