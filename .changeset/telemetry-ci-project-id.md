---
"nestjs-doctor": patch
"nestjs-doctor-lsp": patch
---

Stop sending a project id from CI.

The id was a SHA-256 of the checkout path under a salt that shipped inside the
published package. A runner's path is a fixed template, so the digest was
reversible to a repository name with a wordlist, which is the dictionary attack
the salted id existed to prevent. CI runs now report only the per-provider id.
A local scan is unaffected: its salt is random per machine and never leaves it.
