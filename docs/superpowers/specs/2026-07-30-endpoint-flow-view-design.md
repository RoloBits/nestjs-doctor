# Endpoint flow view: sequence semantics + canonical flow JSON

Date: 2026-07-30. Status: approved direction; implementation is a separate PR after the endpoints overview UI ships.

## Problem

The per-endpoint tree shows *who is called*, but caller-side control flow (conditional throws, branch alternatives, loops) and dataflow (which variable a call produces and who consumes it) are either invisible or, when naively attached to callee boxes, misattributed. Concrete case: `const x = await svc.access(...); if (!x) throw new HttpException(FORBIDDEN); return svc.deleteAccess(...)` must never render the throw inside `AccessService`.

Interim fix (shipped in the overview-UI PR): guard-throws render as caller-owned "break" steps in tree order; call boxes show `→ assignedTo`; tooltips carry condition text, branch kind, iteration context, and the callee signature (labeled as a signature, never as call arguments).

## Decision framework (in priority order)

1. Semantic fidelity — every fact renders on the code location where it happens (hard gate).
2. Deterministic derivability from existing static extraction; no AI at runtime.
3. Reading cost — seconds to grasp; degrades from 2 to 50 calls.
4. Layout stability — insertion of a call must not reflow unrelated elements.
5. Implementation locality.
6. Diffability — phase 3 compares endpoint behaviour across revisions.

## Decision

A per-endpoint **flow view** using UML sequence-diagram semantics rendered in the existing vertical canvas (not a lifeline-per-participant layout initially — the caller column + call rows we already have, upgraded with frames):

- **`break` frames** for guard-throws (caller-owned; "everything below happens only if we didn't break"). Fed by `guardThrow` (`conditionText`, `className`, `message`, `callSiteLine`).
- **`alt`/`opt` frames** for branch groups — mutually exclusive branches finally get spatial encoding. Fed by `branchGroupId`, `branchKind`, `conditionText`.
- **`loop`/`par` frames** for iteration context. Fed by `iterationKind`/`iterationLabel` (`par` for `Promise.all`).
- **Labeled call/return edges**: call edge labeled with the callee signature; dashed return edge labeled with `assignedTo` (PlantUML `return` convention).
- **Hover def-use highlighting** (Flowistry-style): hovering a variable highlights its producing return edge and every consumer (argument expressions, frame guards), fading the rest. Fed by `assignedTo` matched statically against `conditionText`/`stepStatements`/parameter expressions. No permanent dataflow edges — PDG-style dual-edge graphs are unreadable at this granularity.
- 1-D vertical layout: inserting a call inserts a row; nothing else moves. This is the property that makes diagram diffing viable (precedents: AppMap `sequence-diagram-diff` diffs serialized sequence models red/green; SciTools Understand ships Compare Control Flow Graph).

## Canonical flow JSON

Each endpoint's flow serializes to a canonical, deterministic JSON model (calls in order, frames with guards, produced/consumed variables, throws). This artifact is:

- the render input for the flow view,
- the diff substrate for phase 3 (API changelog): structural diff of two flow models → added/removed/changed steps painted green/red on the same renderer,
- machine-readable output agents can consume.

Determinism is the moat: LLM diagram generators produce different output on identical input, so their diffs are noise. Ours diff cleanly because same code → same model, byte for byte.

## Non-goals

- Lifeline-per-service layout (revisit only if the caller-column form proves insufficient).
- Rendering permanent data-dependence edges.
- Any runtime/trace collection (AppMap's approach) — static only.

## Evidence base (research 2026-07-30)

UML combined fragments put guards on the lifeline that evaluates them — the notation was designed to prevent exactly our misattribution; `break` is the standard operator for guard-throws (uml-diagrams.org, PlantUML/Mermaid implementations). AppMap demonstrates sequence-model diffing for PRs; Understand demonstrates CFG comparison. Flowistry demonstrates slice highlighting beating drawn dataflow edges. Comprehension studies (Scanniello et al.) find sequence diagrams aid dynamic-behaviour comprehension with diagram *size* as the dominant cost — supporting collapse-by-default over notation maximalism.
