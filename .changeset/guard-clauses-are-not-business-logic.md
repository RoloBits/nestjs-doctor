---
"nestjs-doctor": patch
---

Stop counting guard clauses as business logic in controllers.

`architecture/no-business-logic-in-controllers` allows one `if` and reports the
second, on the stated basis that one is a guard clause and more is logic. It
counted every `if` the same way, so a handler that only rejects bad input was
reported at error severity:

```ts
@Get('asset-profile/:symbol')
public async getAssetProfile(@Param('symbol') symbol: string) {
  if (this.request.user.dailyRequests > maxDailyRequests) {
    throw new HttpException(getReasonPhrase(TOO_MANY_REQUESTS), TOO_MANY_REQUESTS);
  }
  ...
}
```

An `if` with no `else` whose branch contains only `throw` statements is now
excluded from the count. Rejecting a request is an HTTP concern, which is what
the rule wants left in the controller. An `if/else` still counts as a branch
even when one arm throws, and loops and `switch` are untouched.

Across 76 public projects this takes the rule from 257 findings to 122.

**Fingerprint note.** The message reports the number of branching `if`s, so 37
of the 105 surviving findings now carry a different count. The fingerprint is
derived from the message, and it is emitted as SARIF `partialFingerprints` and
as the GitLab code-quality `fingerprint`, so GitHub code scanning and GitLab
will close those 37 alerts and open them again once. `--scope changed` is
unaffected: it re-scans the base checkout with the same binary, so both sides
carry the new message.
