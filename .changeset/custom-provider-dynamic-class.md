---
"nestjs-doctor": patch
---

Fix `injectable-must-be-provided` false positives when a `useClass` or `provide` value is an expression such as a helper call, a ternary, a property access or a mixin, by following the value to every class it can evaluate to. Count `useExisting` targets and factory `inject` entries as uses for `no-unused-providers` and `no-unused-module-exports`, never as registrations, so a class that is only a `useExisting` target and provided nowhere is now reported.
