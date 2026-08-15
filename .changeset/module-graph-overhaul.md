---
"nestjs-doctor": minor
---

Modules Graph overhaul: schema-style layout with a searchable project tree, resizable sidebar, in-panel module detail (grouped providers/exports, per-section tooltips, import/used-by hover highlighting with animated flow), an info popover for legend and concepts, and a module-problems drawer.

Engine: wrapper decorators now resolve to the framework decorators they compose, so project-specific `@XxxController()` classes and `@XxxReadOneOk()` handlers are recognized as controllers and routes; bootstrap helpers like `standaloneBootstrap(RootModule)` count as application entry points; same-name `@Module` declarations union their metadata instead of last-wins; and cross-project imports no longer produce false `no-orphan-modules` findings in monorepos.

New optional `tags` field on rule meta (builtin and custom rules): tags are stamped onto every diagnostic the rule emits. The builtin module/DI-wiring rules carry `module-graph`, which the report's problems drawer filters on. Fully additive — rules and configs without tags behave exactly as before.
