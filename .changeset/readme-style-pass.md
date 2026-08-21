---
"nestjs-doctor": patch
---

Correct three README claims the source does not support. The Node API
section named `scanProject()`, which does not exist; the exported function
is `diagnose()`. The config section offered a rule severity override that
no engine code reads. And "every finding carries a file, a line" is not
true of the three schema rules, which report against an entity and carry
no line.
