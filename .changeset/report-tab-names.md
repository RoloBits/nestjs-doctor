---
"nestjs-doctor": patch
---

Rename two tabs in the HTML report. **Diagnosis** is now **Findings**, matching
the word the pull request comment already uses, so a reader arriving from
"**3 findings**" lands on a tab spelling it the same way. **Lab** is now
**Rule Lab**, which says what it is without needing the tab open.

The `data-tab` values and element ids are unchanged, so a saved report and any
tooling reading the markup keep working.
