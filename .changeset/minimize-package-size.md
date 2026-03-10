---
"nestjs-doctor": patch
---

Minimize published package size (904 KB → 390 KB unpacked, 200 KB → 101 KB compressed)

- Remove source maps from published package
- Enable minification for API and CLI bundles
- Drop CJS build (ESM-only)
- Embed skill templates as string constants, remove `skill/` from package
- Lazy-load report and init code via dynamic imports (code splitting)
