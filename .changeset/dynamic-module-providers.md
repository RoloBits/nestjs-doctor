---
"nestjs-doctor": patch
---

Fix `injectable-must-be-provided`, `no-unused-providers` and `no-unused-module-exports` false positives for providers registered only through a `DynamicModule`, such as the object a `forRoot()`, `register()`, a standalone function, a `ConfigurableModuleBuilder` `setExtras` callback or a `forRootAsync({ useClass })` option registers. A `providers` key on a testing module, a registry object or a config object still registers nothing.
