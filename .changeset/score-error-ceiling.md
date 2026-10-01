---
"nestjs-doctor": patch
---

Any error-severity finding now caps the score at 89, so a large project can no longer dilute an error into an "Excellent" label. Warnings and infos are still normalised by file count alone. Scores drop on any project that had an error and scored above 89.
