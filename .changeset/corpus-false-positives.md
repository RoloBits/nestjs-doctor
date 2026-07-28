---
"nestjs-doctor": patch
---

Two rules were reporting working code, found by scanning ten public NestJS
projects — ghostfolio, vendure, novu, twenty, immich, amplication and four
starters.

`correctness/no-duplicate-decorators` flagged stacked interceptors:

```ts
@UseInterceptors(RedactValuesInResponseInterceptor)
@UseInterceptors(TransformDataSourceInRequestInterceptor)
@UseInterceptors(TransformDataSourceInResponseInterceptor)
```

Three different interceptors. `@UseInterceptors` accumulates, so stacking is the
same as passing them in one call. The rule compared decorator names and kept an
allowlist of things it knew repeat, which could never be complete. It now
compares the whole decorator, so a repeat means the identical text — which is
what a copy-paste mistake looks like. The allowlist is replaced by the opposite
and much smaller list: the decorators a target can only carry once, like
`@Controller` and `@Module`, where a second is wrong whatever its arguments.

`correctness/validated-non-primitive-needs-type` asked for `@Type()` on any
property whose type was not a primitive, including string unions:

```ts
export type Granularity = 'day' | 'month';
granularity: Granularity;   // reported
```

`@Type()` constructs a class, so a union or alias has nothing to build. The rule
now requires the type to resolve to a class declaration, unwrapping arrays and
unions so `AddressDto | undefined` and `Tag[]` still report.

Across the ten projects this removes 550 findings and leaves the real ones: 44
properties genuinely typed as a nested class with no `@Type()`.
