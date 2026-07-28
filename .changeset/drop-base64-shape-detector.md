---
"nestjs-doctor": minor
---

Remove the base64 shape detector from `security/no-hardcoded-secrets`.

Every other pattern in that rule recognises a format someone issues: a GitHub
token, an AWS access key, a Slack token, a JWT. This one recognised a shape —
any forty characters of the base64 alphabet containing a digit — so everything
base64-ish matched, and three guards had to be bolted on to make it usable:
decode-to-JSON, a pagination-property allowlist, and an identifier heuristic.

Those guards were the rule's two worst failures. The identifier heuristic
cleared about a third of genuinely random keys, measured over 20,000 samples,
and its entropy check was dead code that could not change the outcome. In the
other direction, nine of the twelve tests covering the pattern existed only to
suppress something it wrongly reported: migration class names, camelCase
identifiers, pagination cursors, encoded JSON.

Across three public repositories it found nothing at all. Every secret those
codebases do contain is reported either by a real format pattern or by the
property-name path, both untouched.

What you lose: a base64 secret stored under a name that does not look like a
secret. Under `secret`, `password` or `apiKey` the name path still catches it.
