---
"nestjs-doctor": patch
---

Two `@Module()` classes sharing a class name in different directories no longer silently drop one of the declarations from the module graph. The declarations now union their imports, providers, exports, and controllers — the same behaviour same-directory declarations already had — so cycles through either declaration are detected, and providers or exports on the previously dropped module stop producing phantom `no-unused-providers`, `no-unused-module-exports`, and `no-orphan-modules` findings. A scan warns once per duplicated name, listing every declaration file, and a `no-circular-module-deps` report whose cycle head is declared in several files now names all of them in its help text.
