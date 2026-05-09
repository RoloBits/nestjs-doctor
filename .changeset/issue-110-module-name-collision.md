---
"nestjs-doctor": patch
---

Fix module name collisions in `architecture/no-circular-module-deps`. When two `@Module()` classes share a class name across files, the modules map silently overwrote one with the other, so cycle diagnostics could land on a file that didn't contain the cycle. Modules are now keyed by composite `${filePath}::${name}` and import resolution follows the consumer file's actual `import` declarations (including barrel re-exports), so each cycle is reported against the file that contains it. Addresses the file-attribution observation in #110.
