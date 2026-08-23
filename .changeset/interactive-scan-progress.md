---
"nestjs-doctor": patch
---

The scan now shows live progress: the spinner animates instead of freezing on one frame, a progress bar fills through the parse and rule phases, and monorepo scans label each sub-project. The rule pass yields to the event loop between file batches, so terminal output streams during the scan instead of appearing all at once at the end.
