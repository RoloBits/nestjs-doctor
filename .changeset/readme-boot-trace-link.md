---
"nestjs-doctor": patch
---

Correct the README's `--timings` blurb. It said the boot trace reads "a graph
dump from a real `nest start`", which implies no code change; the dump only
exists after adding the snapshot capture to `main.ts`. The link also pointed at
the Internals output page, which no longer documents the flag, and now points
at the new Boot trace page.
