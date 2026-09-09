---
"nestjs-doctor": patch
---

Kind a class that composes `Controller()` through a wrapper decorator as a controller in the code graph. A codebase using `@XxxRestController()` instead of a literal `@Controller()` had every handler kinded as a service, so 245 of 249 endpoints on a 1444-file monorepo reported the wrong layer.
