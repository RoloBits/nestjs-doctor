---
"nestjs-doctor": minor
---

Endpoints now carry decorator-derived auth state (`auth`: guarded / declared-public / unguarded / unknown, plus direct guard names and a project-level APP_GUARD flag), owning module (`module`), and sub-project attribution (`project`) in monorepo combined results. Controller and route path arrays (`@Controller(['a','b'])`, `@Get(['x','y'])`) and multiple route decorators per handler now produce one endpoint per path/decorator instead of garbled or missing routes. All new `EndpointNode` fields are optional — existing consumers are unaffected.
