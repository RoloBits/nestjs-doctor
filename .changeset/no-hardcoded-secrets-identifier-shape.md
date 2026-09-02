---
"nestjs-doctor": patch
---

### Fixed

`security/no-hardcoded-secrets` no longer flags identifier-shaped strings assigned to a suspicious name: header names (`x-api-key`), config/cache keys (`apikey:lookup:v2`), storage keys (`auth_token_storage`), file paths (`my-app/prod/db-credentials`), constant names (`JWT_SECRET_TOKEN_PROVIDER`, `DATABASE_PASSWORD`), password-strength regexes, and single title-cased words such as `Authorization`. A value with a digit segment still fires unless that segment is a version tag like `v2`. A value counts as a regex source only when it is anchored with `^`, or contains `(?` or a backslash escape (`\d`, `\w`, `\s`, …), so passwords carrying symbols — `P@ssw0rd(2024)!`, `Xk9*mQ2*vL7wRt4z`, `a7Fk92Lm3Qp0Zx8w$`, `S3cure[Pass]word` — still report.

The 64-character hex digest is no longer a pattern of its own. It is reported only through a suspicious binding name, and then once, so a SHA-256 fixture digest, a TypeORM migration id, or a GraphQL persisted-query hash no longer reports as a secret, and `apiSecret` holding one no longer reports twice on the same line.

A `user:pass` or `user/pass` credential pair under a suspicious name still reports (`authToken = 'admin:supersecret'`, `password = 'admin/administrator'`), unless its first segment names the binding the way a permission scope does (`password: 'password:update'`).

The rule accepts a false negative on a purely alphabetic value of three or more words joined by hyphens, underscores or dots, and on two-word values not joined by a colon or slash, when assigned to a suspicious name: `correct-horse-battery-staple`, `super-secret-key-value`, `super_secret_password`, `my-super-secret-jwt-key`, `SuperSecret_Value`. They read as config keys or low-entropy placeholders, and the vendor-format patterns (`sk_live_`, `ghp_`, `AKIA`, JWT, …) still catch a real credential regardless of what it is assigned to.

Scores rise wherever this rule was previously firing on non-secrets.
