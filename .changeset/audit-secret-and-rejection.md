---
"nestjs-doctor": patch
---

Two false negatives found auditing this week's rule changes.

**A colon-separated value stopped being a credential.** The permission-scope
skip was written for `password: "password:update"`, and it excluded digits so
`admin:secretpass123` would survive. Anything else lowercase and colon-separated
went quiet:

```ts
export const authToken = "admin:supersecret";
export const dbPassword = "root:hunter";
export const basicAuthPassword = "admin:admin";
```

`user:pass` is how basic-auth and database credentials get pasted into source.
The skip now applies only when the first segment names the same thing as the
binding, which is the shape it was written for. `password: "password:update"`
and `apiKey: "apikey:rotate"` stay quiet.

**`.catch()` with no handler counted as handled.** `correctness/no-fire-and-forget-async`
accepted any `.catch` in the chain. A bare `.catch()` returns a promise that
rejects with the same reason, so the rejection still reaches the process:

```ts
this.repo.save({}).catch();
```

A `catch` now needs an argument. `.catch(() => {})` still counts, since swallowing
deliberately is not an unhandled rejection.

Neither moves across 189 public projects. Both reproduce in four lines.
