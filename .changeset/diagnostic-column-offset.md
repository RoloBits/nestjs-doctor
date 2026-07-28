---
"nestjs-doctor": patch
---

Report the parameter's column, not its line's file offset.

Four rules built the column from `nameNode.getStartLinePos() + 1`. That method
returns the character offset in the file where the node's line begins, not a
column, so the number grew with the file:

```
accountRole.service.ts:19  col=773   (the line is 34 characters wide)
```

Across 76 public projects, 1,367 of the 1,784 findings from these rules pointed
past the end of their own line, the worst at column 12,645. The value reaches
SARIF `startColumn`, GitHub annotations, the HTML report, and the language
server, which turns it into the squiggle position in the editor.

Affects `correctness/prefer-readonly-injection`, `architecture/no-orm-in-services`,
`architecture/no-orm-in-controllers` and `architecture/no-repository-in-controllers`.
A shared `columnOf()` now subtracts the line start from the node start. Diagnostic
counts and fingerprints are unchanged — `diagnosticIdentity` never used the column.
