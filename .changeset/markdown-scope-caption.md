---
"nestjs-doctor": patch
---

Make the markdown report's scope caption self-explanatory.

When the scan was handed fewer files than the change touched, the caption now
reads "5 of 9 changed files scanned" instead of "5 files in scope" — the old
wording invited a reader to compare it against the pull request's own file count
and read the gap as a miscount. It falls back to the previous wording when the
caller does not know the pre-filter total, and says nothing extra when nothing
was filtered out.

A base given as a full commit SHA is abbreviated to seven characters. Branch
names are printed as they were given.
