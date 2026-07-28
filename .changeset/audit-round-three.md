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
reported as a leak. A logging call is now identified by its receiver, matched
anywhere in the expression so that `this._logger` and `new Logger('Ctx')` both
count, and the search walks out through every enclosing call rather than
stopping at the first.

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

**`correctness/no-fire-and-forget-async` accepted a `.catch()` that only
rethrows.** `promise.catch((e) => { throw e; })` returns a promise that rejects,
so the rejection is still unhandled. A handler whose every statement throws no
longer counts as handling it.

Across 189 public projects this adds 1 finding, a rethrowing catch, and removes
none. The stack trace rule comes out level at 8. A first attempt matched the
receiver too strictly and fired on `this._logger.error(...)` and on
`new Logger('Bootstrap').error(...)`, the ordinary shape at the foot of a
`main.ts`; the corpus caught both. Neither a response helper carrying a stack
nor a repeated route decorator occurs anywhere in public code, so those two are
covered by tests rather than by a number.
