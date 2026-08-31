---
"nestjs-doctor": patch
---

### Fixed

- **The legend button on the Modules Graph opens its popover again.** The click that opened it also reached the document-level outside-click closer, which shut the popover in the same instant; the closer now ignores clicks on the button.
