---
"nestjs-doctor": patch
---

### Changed

- **One line instead of twelve for duplicate module names.** When several `@Module` class names are each declared in more than one file, the console prints a single summary; `--verbose` restores the per-module lines with the file lists. The Node API's warnings keep the full detail.
