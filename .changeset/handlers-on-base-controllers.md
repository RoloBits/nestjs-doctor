---
"nestjs-doctor": patch
---

Recognise HTTP handlers declared on a base class in `correctness/no-async-without-await`.

The rule exempts HTTP handlers, because Nest resolves a returned promise itself
so `async` without `await` is fine there. The exemption required the handler's
own class to carry `@Controller()`:

```ts
if (isController(cls) && isHttpHandler(method)) continue;
```

Nest reads route metadata off the prototype chain, so the common base-controller
pattern puts `@Get()` on a class that is never decorated and lets the concrete
subclass carry `@Controller()`. Those handlers failed the class half of the test
and were reported.

Across 76 public projects there are 71 such classes declaring 404 handlers,
producing 76 findings the rule's own comment calls valid code. The exemption now
keys on the method, matching the `isFrameworkHandler` check directly below it,
which never had a class gate.
