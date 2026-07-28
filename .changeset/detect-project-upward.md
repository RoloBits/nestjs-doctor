---
"nestjs-doctor": patch
---

Find the project's `package.json` when scanning a subdirectory.

`detectProject` read `package.json` from the scanned directory and nowhere else.
Point the scanner at `apps/api/src`, which is where the code lives in a
monorepo, and there is nothing beside it — so the ORM came back null, the Nest
version came back null, and every schema rule was skipped without a word. All
ten public projects used to test this hit it.

It now reads the nearest `package.json` at or above the scanned directory,
stopping at the repository root so a scan never adopts an unrelated parent's
manifest.

Seven of the ten projects now report their ORM, and five of those gain no
findings at all — it is metadata that was missing. Two gain schema findings that
were always there and never ran: three on `twentyhq/twenty`, and 95 on
`vendurehq/vendure`, of which 64 are `require-primary-key` on entities that
declare their key through a custom decorator resolved at runtime. Static
analysis cannot see that one; it is tracked separately.
