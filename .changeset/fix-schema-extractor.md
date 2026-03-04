---
"nestjs-doctor": patch
---

Add schema analysis: extract entity-relationship data from Prisma schemas and TypeORM decorators, run 3 new schema rules (require-primary-key, require-timestamps, require-cascade-rule), render an interactive ER diagram in the HTML report, and surface schema diagnostics in the CLI and LSP. Includes @@id composite primary key support, self-relation classification fix, and backward-compatible RuleContext type alias.
