---
"nestjs-doctor": patch
---

Recognise a controller behind a composed decorator.

Nine rules opened with `if (!isController(cls)) continue;`, and `isController`
matches the literal name `Controller`. A project that wraps it — which NestJS
encourages through `applyDecorators` — was invisible to all nine:

```ts
export const ApiController = (path?: string) => Controller(`/api/v${API_VERSION}/${path}`);

@ApiController('activities')
export class ActivityController {
  @Get('/') activities(@Query() pager: ActivityQueryDto) { switch (pager.type) { ... } }
}
```

`ApiController` returns `Controller(...)`. The class is a controller in every
sense NestJS cares about, and no rule looked at it.

Across 189 public projects there are **58 such classes holding 358 route
handlers**. Examining them adds 86 findings, 72 of them in `mx-space/core`:
`switch` statements in handlers, raw entities returned, repositories injected
into controllers.

A class now counts when it carries `@Controller()`, or when it carries some
class decorator and declares route handlers. A class with **no** decorator at
all is still skipped: NestJS needs a concrete subclass to register it, and a
guard or an injection may live there rather than on the base.
