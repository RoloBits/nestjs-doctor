---
"nestjs-doctor": patch
---

Detect two primary key forms the extractors were missing.

`schema/require-primary-key` fired on entities that have one, because neither
extractor recognised how it was declared.

**Drizzle composite keys.** A junction table declares its key in the extras
callback, not on a column:

```ts
export const userPermissions = pgTable(
  'user_permissions',
  { userId: integer('user_id').notNull(), permissionName: varchar('permission_name').notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.permissionName] })],
);
```

The extractor read that third argument only for `.on(...)` index calls. Both the
object form and the legacy positional `primaryKey(t.a, t.b)` are now read.

**TypeORM on Mongo.** The Mongo driver declares the key as `@ObjectIdColumn()`
on `_id`. It was not in `COLUMN_DECORATORS`, so the column was not extracted at
all and the entity looked keyless. Closes #108.

Across 76 public projects this takes `require-primary-key` from 117 findings to
70 — 30 gone in a Drizzle project, 17 in a TypeORM/Mongo one, with no other rule
moving.
