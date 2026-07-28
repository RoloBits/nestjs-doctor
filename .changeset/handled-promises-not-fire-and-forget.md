---
"nestjs-doctor": patch
---

Stop `correctness/no-fire-and-forget-async` reporting handled promises and
synchronous emits.

Two causes, 254 of the rule's 730 findings across 76 public projects.

**A chain with a rejection handler.** The rule's help text offers `void` plus
explicit error handling as the alternative to `await`. A `.catch()` is that
handling, and it was reported anyway:

```ts
this.allPublicArticlesCache.update().catch((error) => this.logger.error(error));
```

A statement whose chain ends in `.catch(h)`, or in a `.then(ok, fail)` with a
rejection handler, is now left alone. A `.then(ok)` with no rejection handler
still reports, and so does a bare `.finally()`.

**`emit`.** It was in the name heuristic used when the return type cannot be
resolved, but every emitter in the Nest ecosystem returns synchronously —
`EventEmitter2.emit` gives a boolean, socket.io's gives the socket, and
`ClientProxy.emit` gives an Observable, none of which can reject. The message
claimed "unhandled rejections will crash the process" for
`this.eventEmitter.emit('article.created', payload)` in 15 of the 76 projects.
Removing it from the heuristic takes `emit` from 184 findings to the 10 whose
return type genuinely resolves to a Promise.

No message changes, so no fingerprint churn.
