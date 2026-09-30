---
"nestjs-doctor": minor
---

Any error-severity finding on the score surface now caps the score at 89, so a large project cannot dilute an error into an "Excellent" label. Warnings and infos are still normalized by file count alone.
