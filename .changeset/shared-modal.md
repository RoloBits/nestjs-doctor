---
"nestjs-doctor": patch
---

### Changed

- **One modal component.** The share dialog and the report viewer's open-a-report window render through the same `Modal` molecule, so both get the dimmed, blurred backdrop and shadowed panel; `Modal` is exported from `nestjs-doctor/report-ui`.
