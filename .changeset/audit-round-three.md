---
"nestjs-doctor": patch
---

Three rules missed cases they were written to catch. Found by working through
the audit backlog from this week's changes, each reproduced before it was
touched.

**`security/no-exposed-stack-trace` treated any `.error()` call as logging.**
The check took the last segment of the callee name, so `res.error(...)` and
`subscriber.error(...)` counted as logging and the stack went to the client
unreported:

```ts
res.error({ stack: err.stack });      // silent
subscriber.error(err.stack);          // silent
```

It also looked only at the nearest enclosing call, so wrapping the stack on the
way to a real logger made it fire: `this.logger.error(redact(err.stack))` was
reported as a leak. A logging call is now identified by its receiver, split into
words so that `this._logger`, `this.logService`, `new Logger('Ctx')` and a bare
`debug(...)` all count while `this.catalog` does not, and the search walks out
through every enclosing call rather than stopping at the first.

**`correctness/no-duplicate-decorators` stopped seeing repeated route
decorators.** Non-single-use decorators are keyed by their full text so that
`@UseInterceptors(A)` and `@UseInterceptors(B)` read as two interceptors. Route
decorators fell into that bucket, but Nest stores one path per handler, so

```ts
@Get('alpha')
@Get('beta')
handler() {}
```

registers `alpha` and silently drops `beta`. HTTP method decorators are now
single-use.

**`correctness/no-fire-and-forget-async` accepted a `.catch()` that rethrows.**
`promise.catch((e) => { throw e; })` returns a promise that rejects, so the
rejection is still unhandled, and the same is true of the commoner shape that
logs first:

```ts
.catch((e) => { this.logger.error(e); throw e; });
```

A handler that ends by throwing no longer counts as handling it. An empty
handler still does, because swallowing an error deliberately is a different
complaint.

Across 189 public projects this adds 9 findings, all of them rejections that
reach the process, and removes none. The stack trace rule comes out level at 8:
two earlier attempts at the receiver check fired on `this._logger.error(...)`,
`new Logger('Bootstrap').error(...)`, `this.logService.error(...)` and a bare
`debug(...)`, and the corpus caught each round. Neither a response helper
carrying a stack nor a repeated route decorator occurs anywhere in public code,
so those two are covered by tests rather than by a number.
