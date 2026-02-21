---
"nestjs-doctor": patch
---

Remove `prefer-await-in-handlers` rule (async without await is valid in NestJS handlers), add framework handler exemptions (ts-rest, gRPC) to `no-async-without-await`, and reduce false positives in `no-hardcoded-secrets` for Base64 pagination cursors
