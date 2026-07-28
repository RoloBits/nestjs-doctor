---
"nestjs-doctor": patch
---

Check class properties in `security/no-hardcoded-secrets`.

The name-based path walked `VariableDeclaration` and `PropertyAssignment` in two
near-identical blocks. A class field is a `PropertyDeclaration` and matched
neither, so the most natural place to park a credential in a NestJS service was
invisible:

```ts
export class SocketConstants {
  // authentication token
  public static readonly AUTH_TOKEN = 'FutureIsComing';
}
```

That one is real, in `apitable/apitable`, in `src/shared/common/constants/`.
Across 76 public projects it is the only miss the change recovers — a small
number, but for a security rule a miss is the failure that matters.

The three node kinds now run through one loop with the same name test, value
test, and the scope-string, echoed-name and thrown-message skips. No existing
finding changes.
