---
"nestjs-doctor": patch
---

Fix false positives in `require-primary-key` and `require-timestamps` for TypeORM entities that extend an abstract base class.

Previously, the TypeORM extractor only inspected properties declared directly on the entity class. If a project used a shared abstract base class (e.g. `BaseEntity`) to centralise common columns like `@PrimaryGeneratedColumn`, `@CreateDateColumn`, and `@UpdateDateColumn`, every concrete entity extending that base would be flagged — even though those columns exist in the database table.

The extractor now walks the full class hierarchy and collects inherited columns and relations from all ancestor classes. A child-class property always takes precedence over a same-named property on a parent, so overrides are handled correctly.
