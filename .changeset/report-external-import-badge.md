---
"nestjs-doctor": patch
---

Fix the module detail panel never marking an import as external. The graph creates a stand-in node for any import it cannot resolve and flags it `external`, so the panel's `!target` check was always false and both the "external" badge and the dashed row styling were unreachable. An import that comes from a package, for example `ConfigModule` from `@nestjs/config`, now reads as external instead of looking like a module in your codebase.
