---
"nestjs-doctor": patch
---

The module graph reads the metadata a `DynamicModule` registers, not only the `@Module()` decorator.

A class listed in the `providers` of an object returned by `forRoot()`, `forRootAsync()`, `register()`, a static method of any name, a standalone function, a `ConfigurableModuleBuilder` `setExtras` callback, or an inline `{ module, providers }` literal in another module's `imports` was reported by `correctness/injectable-must-be-provided` as unregistered and by `performance/no-unused-providers` as unused, because the graph never opened the returned object. `performance/no-unused-module-exports` reported an export whose only consumer was registered that way. Every library-style module does this.

A literal now counts as module metadata by the same test Nest uses at runtime: it has a `module` key, it is the decorator argument, it is returned from a function typed `DynamicModule`, or it is the `setExtras` transform. Its `providers`, `exports`, `controllers`, provider tokens and `global` flag are unioned into the module it names. The `providers` array itself may be a local variable, a `push`, a spread, a `concat`, a ternary, a static helper method or an imported function, in the decorator and in the literal alike. `imports` inside a dynamic literal still add no edge.

An object with a `providers` or `module` key that is not module metadata, such as a testing module built in a helper file, an OAuth or webpack config, or a plain registry object, registers nothing, so a class listed only there is still reported.
