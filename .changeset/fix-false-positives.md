---
"nestjs-doctor": patch
---

Fix false positives in correctness and security rules

- **no-missing-guard-method, no-missing-pipe-method, no-missing-filter-catch, no-missing-interceptor-method**: Skip classes with an `extends` clause to avoid flagging classes that inherit the required method from a base class (e.g., `AuthGuard extends AuthGuard(['jwt'])`)
- **no-hardcoded-secrets**: Tighten Base64 pattern to require at least one digit, eliminating false matches on long camelCase identifiers. Skip human-readable text (contains spaces) and dot-separated constants (e.g., `AUTH.WEAK_PASSWORD`) from name-based secret detection.
