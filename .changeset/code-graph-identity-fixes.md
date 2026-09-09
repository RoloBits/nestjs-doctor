---
"nestjs-doctor": patch
---

Fix five identity defects in the code graph, all the same root cause: keying a node on a name rather than a declaration. Two injected members whose types share a simple name (`StoreA.Store` and `StoreB.Store`) no longer route both calls to the first member; two packages exporting the same type name no longer share one node; an aliased import no longer splits one interface into two nodes; and a base class sharing its subclass's name is no longer skipped when resolving an inherited call. Merging sub-project graphs is now independent of the order they arrive in, so a shared library's method bodies survive however a monorepo is scanned.
