---
"nestjs-doctor": patch
---

Group every arm of an `if` / `else if` / `else` chain under the `if` the chain opens with, so mutually exclusive arms share a branch group instead of splitting across three. The tail `else` no longer reports the condition of the arm above it, which was the one condition guaranteeing the else does not run; a chained else now carries no condition text, since none describes it.
