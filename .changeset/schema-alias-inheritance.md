---
"nestjs-doctor": patch
---

Resolve base entities imported through tsconfig path aliases.

The analysis project was built without `compilerOptions.paths`, so a base class
imported through an alias like `~/common/entity/common.entity` resolved to
nothing and the inheritance walk stopped before reaching it. An abstract base
carrying `@PrimaryGeneratedColumn()` and the timestamp columns was invisible to
every entity extending it: on `buqiyuan/nest-admin` that meant 13 false
`schema/require-primary-key` errors and 13 false `schema/require-timestamps`
warnings. The same gap affected MikroORM inheritance; Drizzle and Prisma never
resolve TypeScript imports and were unaffected.

The parser now receives the aliases the engine already loads per project. The
TypeORM inheritance walk also stops at `node_modules`, since with aliases
resolving the compiler can now reach `typeorm`'s own `BaseEntity` declaration.

Projects without a tsconfig or without `paths` are untouched.
