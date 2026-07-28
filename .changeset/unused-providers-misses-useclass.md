---
"nestjs-doctor": patch
---

Count a `useClass` target and a base class as used providers.

`performance/no-unused-providers` decided a provider was dead if nothing injected
it by type. Two ways of using one were invisible:

```ts
const repositories: Provider[] = [
  { provide: USER_REPOSITORY, useClass: UserRepository },
];

@Module({ providers: [...repositories] })
export class UserModule {}
```

Nest instantiates `UserRepository`, and a base class runs through every subclass,
without either being a constructor dependency anywhere.

`correctness/injectable-must-be-provided` already collected `useClass` targets,
but only from an array literal written inline in the `@Module` decorator, so the
common pattern of grouping providers into a const and spreading them was missed.
That collector moves to a shared `collectProviderImplementations`, keyed on an
object literal carrying `provide` wherever it appears, and both rules use it.

Across 76 public projects: `no-unused-providers` 236 findings to 212, and
`injectable-must-be-provided` 171 to 168.
