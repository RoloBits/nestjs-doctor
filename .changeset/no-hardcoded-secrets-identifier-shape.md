---
"nestjs-doctor": patch
---

Stop `security/no-hardcoded-secrets` flagging identifier-shaped strings under a suspicious name: header names (`x-api-key`), config and storage keys, file paths, constant names (`JWT_SECRET_TOKEN_PROVIDER`), password-strength regexes and single title-cased words, and stop reporting a bare 64-character hex digest on its own, so migration ids and persisted-query hashes are quiet. Vendor formats (`sk_live_`, `ghp_`, `AKIA`, JWT), `user:pass` pairs and symbol-bearing passwords such as `P@ssw0rd(2024)!` still report; a purely alphabetic phrase like `correct-horse-battery-staple` is an accepted false negative. Scores rise wherever the rule fired on non-secrets.
