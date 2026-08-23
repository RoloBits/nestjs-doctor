---
"nestjs-doctor": minor
---

A scan now reports how a project is configured: the score threshold, which
categories and built-in rules were turned off or overridden, which built-in
rules are ignored, whether a custom rules directory is set, and how many
include, exclude and ignored-file patterns there are.

Patterns and paths are counted, never sent. The custom rules directory reports
as a boolean, glob lists report as counts, and rule ids are filtered through the
built-in registry, so a custom rule name cannot appear in any field.
