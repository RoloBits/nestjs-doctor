# Endpoints tab: overview-first redesign

Date: 2026-07-30. Status: approved.

## Goal

The endpoints tab shows one endpoint's dependency tree at a time. Developers reviewing a NestJS project need the opposite entry point: the whole API surface at a glance — routes, auth coverage, and where diagnostics cluster — with the per-endpoint tree as a drill-down. This is phase one; diffing the endpoint graph against a base revision (the API changelog) is a later phase that builds on the data added here.

## Constraints

- Fully deterministic at execution time. No AI/LLM calls in the pipeline or report. Same input → same output.
- Degrade wider, never narrower: when attribution or resolution fails, the endpoint still appears, flagged, never silently dropped.
- Paths are compared as the strings the engine already carries (ts-morph posix form). No re-resolving with `node:path` at join points.
- The LSP's incremental `updateFile` path must stay correct: no project-global fact may be baked into per-file endpoint extraction.

## PR 1 — engine: auth, ownership, identity, route correctness

### Guard facts

Extract the guard-facts assembly currently inlined in the diagnostician's `fileRuleFacts` (`src/engine/diagnostician.ts:149-184`) into a shared builder (`src/engine/graph/guard-facts.ts`). The `require-guards-on-endpoints` rule consumes it unchanged.

### Auth pass

A separate pass at result-build time — after the module graph, endpoint graph, and guard facts all exist — annotates each endpoint. Not computed inside `extractEndpointsFromFile`, so `updateEndpointGraphForFile` (LSP) is unaffected.

Four states:

| State | Meaning |
|---|---|
| `guarded` | `@UseGuards` on handler or controller, a guard-composing decorator, or an `APP_GUARD` registration |
| `declared-public` | An explicit public-marker decorator (existing `PUBLIC_DECORATORS` list) |
| `unguarded` | No guard evidence found |
| `unknown` | Analysis limitation (e.g. conditional decorator application) |

- Guard class names are reported only for direct `@UseGuards(Identifier)` arguments. Composed decorators and `APP_GUARD` yield `guarded` with no names.
- `APP_GUARD`-derived coverage is carried as a separate project-level flag ("global guard registered"), not per-endpoint certainty — a dead module or a `DynamicModule` registration can make it wrong in either direction.
- GraphQL resolvers (`QUERY`/`MUTATION`/`SUBSCRIPTION`) get the same decorator scan and a GraphQL qualifier; a REST-oriented global guard does not imply GraphQL coverage.

### Module ownership

Each endpoint gets its owning module: controllers join via `ModuleNode.controllers`, resolvers via `providerToModule` (resolvers are providers, never controllers). Keying is by (project, module) to match the merged monorepo graph's `${project}/${ModuleName}` format. Endpoints whose attribution fails land in an explicit "no module" bucket. Same-named-module collisions (#119) are inherited, not fixed here.

### Endpoint identity

Endpoints are identified by `filePath` + `line` + `httpMethod` + `routePath`, replacing the `controllerClass`+`handlerMethod` match that picks the wrong endpoint for same-named controllers. `filePath`+`line` alone is insufficient: path-array expansion (`@Get(['a','b'])`) and multiple route decorators on one handler (`@Get('x') @Post('x')`) both emit several endpoints that share a file and a line.

### Route-path correctness

- `@Controller(['admin','manage'])` and `@Get(['a','b'])` currently render the array literal as text. Path arrays produce one endpoint per path.
- Multiple route decorators on one handler produce one endpoint each (extraction currently returns on the first match).
- Deferred, documented as known-absent: `@Version()`, `enableVersioning`, `setGlobalPrefix`, `RouterModule` prefixes.

`EndpointNode` is a published type: the PR carries a changeset and a compat note for LSP/report consumers. `truncated` already exists on the type and is set by the engine; surfacing it is UI work (PR 2).

## PR 2 — report UI: overview + honest drill-down

### Overview (new default)

A grouped inventory, not a graph: module clusters → controller boxes → endpoint rows. Each row: method chip, route path, auth shield (four states), severity-coloured diagnostic dot. Auto-fit on entry. Simple flow layout — schema mode's component-packing is not reused because without edges every box is an isolated component and it degenerates to a grid. No edges in v1 (deliberate; a "shared dependency" hint may come later).

### Diagnostics

Per-endpoint counts computed in `prepareReportData` by joining `CodeDiagnostic` `filePath`+`line` against `line..endLine`, gated on `isCodeDiagnostic`. Diagnostics inside a controller but outside every handler range roll up to a controller-level count, so nothing disappears. A PROBLEMS-style drawer (schema parity) lists rule id + message with click-to-navigate.

Caveat shown in the UI: counts follow the report's diagnostics as scoped; zero dots under a narrowed scope means "nothing reported here", not "clean".

### Focused mode (existing tree, kept as drill-down)

- The tree opens collapsed to the handler's direct calls; each node with children carries an expand chip.
- Fix click-vs-drag: movement threshold (~4px) before a drag starts, and preserve the grab offset (today any 1px move cancels the click and teleports the node's centre to the cursor — the code panel is effectively unreachable).
- Truncation banner when `truncated` is set.
- Legend: `#N` = call order, dashed amber = conditional, colours = provider type.
- Zoom toolbar with visible % (schema parity); camera preserved on resize; code panel no longer occludes the sidebar.
- Distinct method chips for `ALL` and `SUBSCRIPTION` (everything non-CRUD renders as GET today).
- The auth shield for GraphQL endpoints (`httpMethod` `QUERY`/`MUTATION`/`SUBSCRIPTION`) must not be derived from `auth.globalGuard` — a REST-oriented global guard does not imply GraphQL coverage.

### Sidebar

Regrouped module → controller → endpoint, with a search box that filters.

## Testing

- Engine: guard/module attribution in both directions (fires and must-not-fire), path arrays, multiple route decorators, resolver attribution, a schema diagnostic passed through the join.
- UI: a layout test mirroring `tests/unit/report-schema-layout.test.ts` (the endpoints layout has none today).

## Deferred

Base-revision diffing and change classification (API changelog), overview edges, `@Version()`/`RouterModule`/global prefix, lazy serialisation of dependency trees, git-churn overlays, provenance.
