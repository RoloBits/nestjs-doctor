---
"nestjs-doctor": patch
---

### Changed

- **Two react-doctor findings fixed in the report app.** The share dialog's section set now uses a lazy state initializer instead of rebuilding a Set every render, and the Modules tab derives its unused-provider map with `useMemo` instead of mutating a ref during render.
