---
"nestjs-doctor": patch
---

Recognise `@Global()` visibility and `@Inject()` tokens in
`performance/no-unused-module-exports`.

The rule decided who could see an export by walking explicit `imports` arrays.
A `@Global()` module is visible to every module without an import edge, so the
walk never found the consumer:

```ts
@Global()
@Module({ providers: [{ provide: DRIZZLE, useFactory }], exports: [DRIZZLE] })
export class DatabaseModule {}

@Injectable()
export class CustomersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
}
```

Two things were missing. A global module's consumers are every module, not its
importers. And usage was read from constructor parameter *types* only, so an
`@Inject(TOKEN)` injection of a token-provided export counted for nothing.

Across 76 public projects this takes the rule from 345 findings to 268. Closes #104.
