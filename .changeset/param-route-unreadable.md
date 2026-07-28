---
"nestjs-doctor": patch
---

Stop `correctness/param-decorator-matches-route` reporting routes it cannot read.

The rule stripped quotes off the decorator's first argument and treated whatever
was left as the path. When the path is a constant rather than a literal, that
produced an empty path, no known route parameters, and a mismatch for every
`@Param()` on the method:

```ts
@Delete(AdApiDefinition.deleteById.server)
async deleteAd(@Request() req, @Param('id') id) {}
```

> `@Param('id') does not match any route parameter. Available: (none).`

The rule now only compares when the path is a string literal, on the method and
on the controller alike. Across 22 public projects this removes 44 of 45
findings — every one whose message said the available parameters were `(none)`.
The one that remains has a literal path and is a genuine mismatch to look at.
