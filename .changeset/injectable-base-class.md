---
"nestjs-doctor": patch
---

`correctness/injectable-must-be-provided` no longer asks you to register a base
class.

The rule reports an `@Injectable()` class that appears in no module's
`providers`, and suggests adding it or dropping the decorator. A base class is
neither: it is registered through every subclass that extends it, and dropping
its `@Injectable()` breaks the constructor injection those subclasses inherit.
`immich`'s `BaseService` is extended by 50 classes and was reported.

A class named in an `extends` clause anywhere in the project is now skipped. The
engine already collected that set for `no-unused-providers`; this rule just was
not using it.

Across 189 public projects this removes 5 findings and adds none.
