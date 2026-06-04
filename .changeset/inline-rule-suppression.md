---
"nestjs-doctor": minor
---

Add inline rule suppression via source comments. Silence a rule for a single line or an entire file without editing the config, using `// nestjs-doctor-ignore` directives (with `disable` accepted as an alias):

```typescript
const config = eval(raw); // nestjs-doctor-ignore security/no-eval

// nestjs-doctor-ignore-next-line security/no-eval
const config = eval(raw);

// nestjs-doctor-ignore-file security/no-eval
```

Supported directives: `nestjs-doctor-ignore` / `-line` (same line), `-next-line` (line below), and `-file` (whole file). The rule list is space- or comma-separated; omit it to suppress every rule for that scope. An optional `-- reason` trailer is ignored so the exception can be documented inline. Line-scoped directives apply to code diagnostics; schema diagnostics (which have no line) are suppressed with `-file`. This implements the previously-documented-but-inert `// nestjs-doctor-ignore` convention referenced by the bundled skill.
