---
"nestjs-doctor": patch
---

Recognise a provider whose only decorator sits on a constructor parameter.

`correctness/no-missing-injectable` asks whether TypeScript emits
`design:paramtypes` for the class, which is what Nest's injector reads. It
checked for a class-level decorator, but a decorator on any constructor
parameter triggers the same emit:

```ts
export class NotificationRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}
}
```

Compiling that with `emitDecoratorMetadata` produces the metadata, so the class
resolves its dependencies without `@Injectable()`. It was reported anyway — 12
times on `immich-app/immich`, which injects its Kysely connection this way
throughout.

A provider with constructor parameters and no decorator anywhere, the shape that
actually fails at boot, still reports.
