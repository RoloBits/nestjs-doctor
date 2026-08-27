---
"nestjs-doctor": patch
---

Fix the CLI hanging forever when the terminal reports no size. A pty created without a window size reports `columns: 0`, which sent the scan and report spinners into a synchronous infinite loop that pegged a core and wrote ANSI escapes until the disk filled. The spinner now uses `yocto-spinner`, which handles a zero width, in place of `ora`, which does not.

A failed scan or report now ends its spinner with `✖ Scan failed` instead of printing a green `✔ Scan complete` just before the error. The CLI also exits after a scan on a TTY stdin rather than lingering.
