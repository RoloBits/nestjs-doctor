---
"nestjs-doctor": patch
---

A call on an installed ORM client such as a TypeORM `Repository<Order>`, an `EntityManager`, a `DataSource`, a Mongoose `Model` or a `PrismaClient` is now a database node in the code graph, named by the entity it targets, instead of an unresolved external call. The Endpoints tab's read-or-write verdict now covers TypeORM and Mongoose routes, and `save`, `insert`, `remove`, `softDelete` and `restore` count as writes.
