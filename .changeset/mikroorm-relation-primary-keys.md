---
"nestjs-doctor": patch
---

Stop `schema/require-primary-key` reporting MikroORM entities whose primary
key is declared through relations, via `primary: true` on `@ManyToOne` or
`@OneToOne` (composite pivot tables, shared 1:1 keys).
