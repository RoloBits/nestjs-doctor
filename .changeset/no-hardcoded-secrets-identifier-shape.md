---
"nestjs-doctor": patch
---

### Fixed

`security/no-hardcoded-secrets` no longer flags identifier-shaped strings assigned to a suspicious name: header names (`x-api-key`), config/cache keys (`apikey:lookup:v2`), storage keys (`auth_token_storage`), file paths (`my-app/prod/db-credentials`), constant names (`JWT_SECRET_TOKEN_PROVIDER`, `DATABASE_PASSWORD`), password-strength regexes, and single title-cased words such as `Authorization`.

The 64-character hex pattern now only fires when the enclosing variable or property has a suspicious name, so a SHA-256 fixture digest, a TypeORM migration id, or a GraphQL persisted-query hash no longer reports as a secret.

Two purely alphabetic, multi-word placeholder values (`SuperSecret_Value`, `my-super-secret-jwt-key`) are accepted false negatives: they read as low-entropy dev placeholders, and the vendor-format patterns (`sk_live_`, `ghp_`, `AKIA`, JWT, …) still catch a real credential regardless of what it is assigned to.

Scores rise wherever this rule was previously firing on non-secrets.
