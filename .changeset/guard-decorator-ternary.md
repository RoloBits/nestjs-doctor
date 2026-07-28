---
"nestjs-doctor": patch
---

`security/require-guards-on-endpoints` no longer calls a guarded endpoint
unguarded when the guard is chosen by a ternary.

A composed auth decorator is recognised by looking for `UseGuards(...)` among
the arguments of `applyDecorators(...)`, and the check required an argument to
*be* that call. It commonly is not:

```ts
export function Auth(allowApiKeyAuth = false, isOptionalAuth = false) {
  return applyDecorators(
    SetMetadata(IS_OPTIONAL_AUTH_KEY, isOptionalAuth),
    allowApiKeyAuth
      ? UseGuards(MultiAuthGuard, ApiKeyRateLimitGuard, AuthenticationGuard)
      : UseGuards(JwtAccessTokenGuard, AuthenticationGuard),
  )
}
```

Both branches apply a guard, but the argument is a conditional expression rather
than a call, so `Auth` was not recorded and every `@Auth()` endpoint was
reported as having no guard. A spread such as `applyDecorators(...guards)` fell
out the same way. The argument's whole subtree is now searched.

This is the worst direction for a security rule to be wrong in: it says an
endpoint is unprotected when it is protected. Across 189 public projects it
removes 138 findings, all in one project that uses the ternary form, and adds
none. That project still reports its 14 genuinely unguarded endpoints.
