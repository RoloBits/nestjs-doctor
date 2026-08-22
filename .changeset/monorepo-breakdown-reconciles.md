---
"nestjs-doctor": patch
---

Make a monorepo's sub-project breakdown add up to its combined totals.

Sub-projects that share a workspace-root file each report what they find in it,
so a root `package.json` or a root schema produced one finding per sub-project.
The combined result already dropped the repeats for schema findings; it now does
the same for the rest, and each sub-project carries what the combined result
took from it.

On a 45-project workspace the breakdown summed to 432 warnings under a combined
count of 375. Both now read 375. A finding on a shared file is listed under one
sub-project rather than all of them.

Scores are unchanged. A sub-project's score still describes everything that
sub-project scanned, never the subset the breakdown prints, so nothing scores
better for having a sibling report the shared finding first.
