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

A class named in an `extends` clause is now skipped. The engine already
collected that set for `no-unused-providers`; this rule just was not using it.
Test files are left out of the collection, so a stub such as
`class Stub extends OrphanThing {}` in a spec cannot exempt a production class.

Two limitations, both inherent to matching on a bare class name, which is the
contract `collectExtendedClasses` already had: an unrelated class sharing a base
class's name is exempted too, and a base extended only by subclasses that are
themselves unregistered goes quiet while those subclasses are still reported.

Across 189 public projects this removes 5 findings and adds none.
