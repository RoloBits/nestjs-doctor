---
"nestjs-doctor": patch
---

The scan no longer reads installed packages when resolving types. A 354-file project spent 7.3 of its 8.0 seconds having TypeScript parse and type 182 MB of `node_modules`; it now takes 0.7 seconds, and a 45-project monorepo went from 76 to 12 seconds. Workspace packages linked into `node_modules` stay visible, so a decorator or base class in your own library still resolves. A type that only an installed dependency knows now reads as `any`, which affects rules that inspect a return type rather than a declaration.
