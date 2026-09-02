---
"nestjs-doctor": patch
---

### Fixed

`security/no-hardcoded-secrets` no longer flags identifier-shaped strings assigned to a suspicious name: header names (`x-api-key`), config/cache keys (`apikey:lookup:v2`), storage keys (`auth_token_storage`), file paths (`my-app/prod/db-credentials`), constant names (`JWT_SECRET_TOKEN_PROVIDER`, `DATABASE_PASSWORD`), password-strength regexes, and single title-cased words such as `Authorization`. A value with a digit segment still fires unless that segment is a version tag like `v2`. A value counts as a regex source only when it is anchored with `^`, or contains `(?` or a backslash escape (`\d`, `\w`, `\s`, …), so passwords carrying symbols — `P@ssw0rd(2024)!`, `Xk9*mQ2*vL7wRt4z`, `a7Fk92Lm3Qp0Zx8w$`, `S3cure[Pass]word` — still report.

The 64-character hex digest is no longer a pattern of its own. It is reported only through a suspicious binding name, and then once, so a SHA-256 fixture digest, a TypeORM migration id, or a GraphQL persisted-query hash no longer reports as a secret, and `apiSecret` holding one no longer reports twice on the same line.

The rule now accepts a false negative on any purely alphabetic, separator-bearing value assigned to a suspicious name (an underscore, hyphen, colon, dot, or slash joining plain words, no digits) — it reads as a config key or a low-entropy dev placeholder, and the vendor-format patterns (`sk_live_`, `ghp_`, `AKIA`, JWT, …) still catch a real credential regardless of what it is assigned to. Two probed examples: `SuperSecret_Value` and `my-super-secret-jwt-key`. This is a real trade-off, not just those two strings: a value shaped like `super_secret_password` (no digits, underscore-separated) is also no longer caught.

Scores rise wherever this rule was previously firing on non-secrets.
