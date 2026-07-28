---
"nestjs-doctor": patch
---

Recognise every `@Inject*` token decorator in
`correctness/require-inject-decorator`.

The rule reports a constructor parameter with no type annotation and no
injection token, at error severity, saying NestJS cannot resolve it. It looked
for exactly one decorator name:

```ts
const hasInject = param.getDecorators().some((d) => d.getName() === "Inject");
```

Every other Nest DI decorator supplies a token the same way — `@InjectRepository`
and `@InjectEntityManager` and `@InjectDataSource` from TypeORM, `@InjectModel`
from Mongoose, `@InjectQueue` from Bull, and whatever a community package adds.
So this working code was an error:

```ts
constructor(@InjectRepository(Company) repo) {}
```

Across 76 public projects and 16 Nest libraries the rule fires 7 times, and 6 of
those carry `@InjectRepository`. The check now keys on the `Inject` prefix, which
is the naming every one of these follows, rather than a list that needs a new
entry per package. `@Optional()` on its own still reports, because it supplies no
token.
