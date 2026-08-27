---
"nestjs-doctor": patch
---

Internal refactor, no behavior change: the HTML report's UI sources are split into files instead of three template literals. The stylesheet moved out of `styles.ts` into nine cascade-ordered `.css` files loaded with `?raw` and inlined at build time, the report's script split into twelve modules, and its markup into eight. The emitted report is byte-identical, still one self-contained file with no extra network requests.

`tsdown.config.ts` gained a small plugin that resolves a `?raw` import to the file's text and registers the file with the watcher, so `pnpm dev` rebuilds on a stylesheet edit.
