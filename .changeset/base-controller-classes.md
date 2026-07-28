---
"nestjs-doctor": patch
---

Examine route handlers declared on an undecorated base controller.

Nest reads route metadata off the prototype chain, so a base class can hold the
handlers while the concrete subclass carries `@Controller()`:

```ts
export class DomainControllerBase<T> {          // no decorator at all
  @Get()
  async getItems(@Req() req): Promise<T[]> { return this.entityRepo.find(...); }
}

@Controller('/reminder/:organizationSlug/:userId')
export class ReminderController extends DomainControllerBase<ReminderEntity> {}
```

The previous release taught the controller rules to recognise a decorator that
composes `Controller()`. This one drops the decorator requirement entirely: a
class declaring route handlers is examined whether or not it carries anything.

Across 211 public repositories there are 10 such classes holding 33 handlers,
and examining them adds 35 findings — repositories injected into a controller,
raw entities returned, endpoints with no guard.

Two rules needed care rather than widening:

- **`require-guards-on-endpoints`** now knows which base classes a subclass
  guards, gathered once per run beside the existing `APP_GUARD` and composed
  decorator facts. A base whose subclass carries `@UseGuards` is left alone; one
  nothing guards is reported.
- **`param-decorator-matches-route`** treats a missing `@Controller()` as an
  unreadable prefix rather than an empty one, so a `@Param('orgId')` matching a
  prefix declared on the subclass is not reported as a mismatch.

Closes #179.
