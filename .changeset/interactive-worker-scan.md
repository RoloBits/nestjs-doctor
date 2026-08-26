---
"nestjs-doctor": patch
---

Interactive scans run the engine in a worker thread, so the spinner and the progress bar animate continuously instead of freezing while the scan works. The bar eases toward each new count and phase labels wipe in rather than jump, and the parse, module graph, provider, and guard-index passes yield to the event loop in smaller batches. CI and machine-readable runs scan in-process exactly as before, and a worker failure falls back to the in-process scan.

The score screen's sub-project list is now a two-pane browser: the list is ordered worst score first, the view scrolls with the selection, left/right switches between the projects and the action menu, and a right panel shows the selected project's score, counts, and worst rules. Single-project scans render exactly as before.
