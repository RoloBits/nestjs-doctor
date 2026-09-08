---
"nestjs-doctor": patch
---

Order each endpoint's dependency list by where a call finishes rather than where it starts, so `save(findOne(id))` shows the fetch before the save. Every method is renumbered, not only the ones containing an inline logic step, which closes the gaps a merged guard-throw used to leave in the sequence. On a 157-endpoint project 45 endpoints reorder and the set of nodes is unchanged.
