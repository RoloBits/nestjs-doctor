# Endpoints Overview UI (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The endpoints tab opens on an API-surface overview (module clusters → controller boxes → endpoint rows with method chip, path, auth shield, diagnostic dot) and drills down into the existing per-endpoint tree, whose broken interactions get fixed.

**Architecture:** Data joins happen in Node (`prepareReportData`) where they are unit-testable; the report canvas code in `src/report/ui/scripts.ts` (a template string emitting browser JS) gains an overview mode mirroring schema mode's proven patterns (`sComputeOverviewLayout` family, PR #220), and the focused tree keeps its renderer with interaction fixes. Spec: `docs/superpowers/specs/2026-07-30-endpoints-overview-design.md` (PR 2 section). PR 1 (branch `feat/endpoint-auth-metadata`, this branch's parent) added `EndpointNode.auth` / `.module` / `.project`.

**Tech Stack:** TypeScript, hand-rolled 2D canvas in emitted JS, dagre only where already used, vitest.

## Global Constraints

- Fully deterministic; no AI, no network beyond the existing dagre CDN load.
- Degrade wider, never narrower: an endpoint with failed attribution appears under "(no module)"; unknown auth renders as `unknown`, never as public or guarded.
- Endpoint identity everywhere: `filePath` + `line` + `httpMethod` + `routePath` (spec amended after PR 1 — `filePath`+`line` alone is NOT unique). In the UI, select endpoints by their index in `endpoints.endpoints`; never by `controllerClass`+`handlerMethod`.
- The auth shield for GraphQL endpoints (`httpMethod` `QUERY`/`MUTATION`/`SUBSCRIPTION`) must not use `auth.globalGuard` — render their state without the global-guard qualifier.
- Diagnostic joins gate on `isCodeDiagnostic` (`SchemaDiagnostic` has no line — CLAUDE.md invariant). Compare `filePath` strings as-is; never re-resolve with `node:path`.
- Comments what-only ≤2 lines. No `Co-Authored-By`/`Claude-Session` trailers. Conventional Commits. Never `--no-verify`.
- Mirror schema mode's existing patterns and names (prefix `ep` where schema uses `s`); do not restructure `scripts.ts` beyond the endpoints section.

---

### Task 1: Endpoint diagnostic counts in report data

**Files:**
- Create: `packages/nestjs-doctor/src/report/formatters/endpoint-diagnostics.ts`
- Modify: `packages/nestjs-doctor/src/report/formatters/report-data.ts` (add `endpointDiagnosticsJson`), `packages/nestjs-doctor/src/report/ui/scripts.ts:1-30` (declare `const endpointDiagnostics = ...` in `getReportScripts` and add the field to `ReportScriptData`)
- Test: `packages/nestjs-doctor/tests/unit/endpoint-diagnostics.test.ts`

**Interfaces:**
- Consumes: `EndpointNode` (with `line`, `endLine`, `filePath`, `httpMethod`, `routePath`), `Diagnostic` + `isCodeDiagnostic` from `src/common/diagnostic.ts`.
- Produces:

```ts
export interface EndpointDiagnosticCounts {
	/** Keyed by endpoint index in endpoints.endpoints, as a string. */
	perEndpoint: Record<string, { error: number; warning: number; info: number }>;
	/** Diagnostics in a scanned file that fall outside every handler range. Keyed by filePath. */
	perFile: Record<string, { error: number; warning: number; info: number }>;
}

export function computeEndpointDiagnostics(
	endpoints: EndpointNode[],
	diagnostics: Diagnostic[]
): EndpointDiagnosticCounts
```

Rules: a code diagnostic joins every endpoint whose `filePath` matches exactly and whose range `line..endLine` contains `diagnostic.line` (a handler emitting two endpoints counts it on both rows — same underlying issue, both rows must show it). A code diagnostic whose file contains at least one endpoint but matches no range goes to `perFile`. Diagnostics in files with no endpoints are ignored (other tabs own them). Schema diagnostics never join.

- [ ] **Step 1: Write the failing test** — cases: (a) diagnostic on a handler line → counted on that endpoint index; (b) same handler emitting GET+POST endpoints → counted on both indices; (c) diagnostic in a controller file outside every handler → `perFile` only; (d) schema diagnostic (no `line`) in input → ignored, no crash; (e) diagnostic in a file with no endpoints → nowhere; (f) severities bucketed correctly. Build `EndpointNode[]` fixtures as plain object literals (no ts-morph needed) and diagnostics as plain literals matching `CodeDiagnostic`/`SchemaDiagnostic` shapes — read `src/common/diagnostic.ts` first for exact required fields.
- [ ] **Step 2: Run** `pnpm --filter nestjs-doctor exec vitest run tests/unit/endpoint-diagnostics.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement** `computeEndpointDiagnostics` (two passes: index endpoints by filePath, then bucket each code diagnostic). Wire into `prepareReportData`: `endpointDiagnosticsJson = safeJsonForScript(JSON.stringify(computeEndpointDiagnostics(result.endpoints?.endpoints ?? [], result.diagnostics)))`; add `const endpointDiagnostics = ${data.endpointDiagnosticsJson};` beside the other consts in `getReportScripts`.
- [ ] **Step 4: Run** the new test + full package suite — PASS.
- [ ] **Step 5: Commit** `feat(report): compute per-endpoint diagnostic counts for the endpoints tab`

---

### Task 2: Sidebar regroup, search, index-based selection, method chips

**Files:**
- Modify: `packages/nestjs-doctor/src/report/ui/scripts.ts` — `renderEndpoints()` sidebar build (~`:4131-4249`), `METHOD_COLORS` (~`:4156`), endpoint selection (~`:4209-4241`); `packages/nestjs-doctor/src/report/ui/html.ts:298-307` (search input); `packages/nestjs-doctor/src/report/ui/styles.ts` (chip/shield/dot styles)
- Test: none runnable for DOM string-building; correctness lands in Task 5's visual verification. Keep changes mechanical.

**Interfaces:**
- Consumes: `endpoints.endpoints[i].module` / `.project` / `.auth` (PR 1), `endpointDiagnostics` (Task 1).
- Produces: sidebar grouped `module → controller → endpoint`; every endpoint row carries `data-ep-index="<i>"`; selection and the canvas build key off that index (`epSelectedIndex`). Helper `epAuthShield(ep)` returning `{glyph, cls, label}` reused by Task 3.

Requirements:
- Group order: modules sorted alphabetically, `"(no module)"` last; monorepo: group label is the prefixed module (`api/CatsModule`) as stored.
- Row: method chip + `routePath` + auth shield + diagnostic dot. Shield: `guarded` ✓ green, `declared-public` ○ blue, `unguarded` ⚠ amber, `unknown` ? grey; tooltip lists `auth.guardNames` when present; append "global guard registered" only when `auth.globalGuard` AND the endpoint is not GraphQL (`QUERY`/`MUTATION`/`SUBSCRIPTION`). Dot: highest severity colours it (error `var(--error)`, warning amber, info blue), text = total count; absent when zero.
- `METHOD_COLORS`: add distinct entries for `ALL`, `HEAD`, `OPTIONS`, `QUERY`, `MUTATION`, `SUBSCRIPTION` (GraphQL entries visually distinct from REST — e.g. purple family). No silent GET fallback: unknown methods get a neutral grey chip.
- Search `<input id="endpoints-search">` in the sticky header: case-insensitive substring filter over `routePath`, `controllerClass`, `handlerMethod`, module; hides non-matching rows and empties groups; filters, not highlights.
- Selection: replace the `controllerClass`+`handlerMethod` first-match lookup with the row's `data-ep-index`. Fix the dead controller-row toggle: clicking anywhere on a controller header toggles its group (today only the caret `.st-toggle` works, ~`:4193-4206`).
- [ ] Steps: implement → `pnpm --filter nestjs-doctor test && pnpm typecheck` (report emit must still typecheck/build) → commit `feat(report): regroup endpoints sidebar by module with search, auth shields, index selection`

---

### Task 3: Overview canvas mode (new default) + problems drawer

**Files:**
- Modify: `packages/nestjs-doctor/src/report/ui/scripts.ts` (endpoints section), `html.ts:284-327` (toolbar toggle button, drawer container, remove empty-state as entry state), `styles.ts`
- Test: `packages/nestjs-doctor/tests/unit/report-endpoints-layout.test.ts`

**Interfaces:**
- Consumes: `epAuthShield` (Task 2), `endpointDiagnostics` (Task 1).
- Produces: `epMode: "overview" | "focused"` (initial `"overview"`); pure layout fn `epComputeOverviewLayout(groups, boxWidth)` emitted between marker comments `// ep-overview-layout-start` / `// ep-overview-layout-end` so the test can extract it exactly the way `tests/unit/report-schema-layout.test.ts:79-108` extracts schema's (read that file first and copy its `new Function` technique).

Requirements:
- Overview draws controller boxes grouped under module cluster headers. Box: header = controller class name; rows = endpoints (method chip, truncated path, shield glyph, dot) at fixed row height; box width fixed (320px), height = header + rows (cap visible rows at 12 with a `+N more` final row — mirror schema's `sVisibleColCount` idea). Layout: within a module, boxes shelf-packed left-to-right wrapping at a target width derived from total area (mirror `sPackBoxes` `:2264-2278` math); modules stacked vertically with a cluster header line. No edges. No dagre dependency for overview (pure arithmetic — works offline).
- Label truncation precomputed once per box (mirror `sCacheNodeLabels` `:2489-2522`), never inside the draw loop.
- Auto-fit camera on entry and on tab re-entry when in overview (mirror `sCenterCamera` `:2560-2594` incl. min-zoom recording). Zoom/pan: same wheel/drag handlers as focused mode, shared.
- Click an endpoint row → `epMode = "focused"`, select that index, existing tree renders; toolbar gains a view-toggle button mirroring `#schema-toggle-view` (`:3337-3345`) with `aria-pressed`, plus back-to-overview. Keep the recenter button working in both modes.
- Problems drawer (schema parity — mirror `#schema-problems` markup `html.ts:271-280` and logic `scripts.ts:3598-3667`): lists code diagnostics joined to endpoints (from `endpointDiagnostics` indices; resolve rule/message/severity from the `diagnostics` array), plus per-file rollup rows labelled with the file name. Click → focused mode on that endpoint + code panel at the diagnostic line. Drawer header carries the scope caveat verbatim: "Counts reflect this report's diagnostics; a narrowed scan scope reports fewer, not cleaner."
- Layout test asserts: no box overlap within and across module clusters; module grouping preserved; `+N more` row math; determinism (two runs identical). Use a synthetic 30-endpoint/8-controller/3-module fixture.
- [ ] Steps: extract-technique study → failing layout test → implement layout pure fn → implement draw/interactions/drawer → full suite → commit `feat(report): endpoints overview mode with module clusters and problems drawer`

---

### Task 4: Focused-mode interaction fixes

**Files:**
- Modify: `packages/nestjs-doctor/src/report/ui/scripts.ts` (focused-mode handlers ~`:4244-4406`, `epResize` `:4046-4061`, `epCenterCamera` `:3819-3842`), `html.ts` (zoom toolbar, legend, truncation banner containers), `styles.ts` (code panel side, banner, legend)

**Interfaces:** consumes `epMode`/`epSelectedIndex` (Task 3). No new exports.

Requirements, each independently verifiable:
1. **Click-vs-drag:** a drag starts only after >4px cumulative movement from mousedown; store grab offset (`epDragging = {node, dx, dy}`) so the node moves relative to grab point instead of teleporting its centre to the cursor (today ~`:4251-4271` sets `epDragging.x = pos.x`). Below threshold, mouseup is a click → code panel opens.
2. **Zoom toolbar** in `#endpoints-toolbar`: −/+/% readout + fit, mirroring schema's (`html.ts:229-238`, handlers `:3401-3418`); one `epZoomFloor()` replaces the mismatched clamps (`[0.3,1.5]` in `epCenterCamera` vs `[0.2,3]` on wheel `:4324`).
3. **Camera preserved:** `epResize` shifts camera by half the size delta (mirror `sResize` `:2876-2898`) instead of unconditionally re-centring; tab re-entry keeps the camera in focused mode.
4. **Truncation banner:** when the selected endpoint has `truncated`, show a dismissible banner over the canvas: "Trace truncated at 5000 nodes — the tree below is incomplete."
5. **Legend** (small fixed overlay, both modes, toggle button in toolbar): type colours (11 entries from `EP_TYPE_COLORS` `:3687-3699`), `#N` = call order, dashed amber = conditional call, `↱` = drawn at another call site; overview adds shield/dot meanings.
6. **Code panel** anchors right (`right:0`, sidebar stays usable, ~`styles.ts:1086-1092`); tooltip z-index no longer draws over it.
- [ ] Steps: implement → `pnpm --filter nestjs-doctor test && pnpm typecheck && pnpm build` → commit `fix(report): endpoints focused-mode interactions — click threshold, zoom toolbar, camera, banner, legend`

---

### Task 5: Changeset, verification, visual QA

**Files:**
- Create: `.changeset/endpoints-overview-ui.md` (`"nestjs-doctor": minor` — "The report's endpoints tab now opens on an API-surface overview: module clusters, controller boxes, per-endpoint auth shields and diagnostic counts, with search and a problems drawer. The per-endpoint dependency tree remains as drill-down with fixed click/zoom/camera interactions, a truncation banner, and a legend.")

Steps:
- [ ] `pnpm check && pnpm typecheck && pnpm test && pnpm build`
- [ ] Generate reports from `packages/nestjs-doctor/tests/fixtures/endpoint-graph-patterns` and `tests/fixtures/drizzle-app` (`node packages/nestjs-doctor/dist/cli/index.mjs <fixture> --report <scratch>/r.html` — verify flag shape via `--help`), serve over localhost (file:// is blocked by the browser extension), and visually verify in Chrome: overview default + auto-fit, shields match fixture guards, dots match diagnostics, search filters, row click drills down, code panel opens on plain click, zoom toolbar, truncation banner absent (fixtures are small), legend, GraphQL rows show no global-guard qualifier. Screenshot each state.
- [ ] Commit `chore: changeset for endpoints overview UI`
