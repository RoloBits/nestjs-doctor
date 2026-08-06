# Endpoint Auth & Metadata (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Annotate every endpoint with deterministic auth state and module ownership, and fix route-path extraction, so the report UI (PR 2) can render a trustworthy API-surface overview.

**Architecture:** A shared guard-facts builder is extracted from the diagnostician; a new annotation pass runs in `buildResult` (after all graphs exist — never inside per-file extraction, so the LSP's incremental `updateFile` stays correct) and mutates `EndpointNode`s with `auth` and `module`. Route extraction learns path arrays and multiple route decorators.

**Tech Stack:** TypeScript, ts-morph, vitest. Spec: `docs/superpowers/specs/2026-07-30-endpoints-overview-design.md`.

## Global Constraints

- Fully deterministic: no AI, no network, no timestamps in outputs.
- Degrade wider, never narrower: attribution failure → explicit `"unknown"` / `null`, never a dropped endpoint.
- Paths are ts-morph posix strings; compare as-is, never re-resolve with `node:path`.
- No project-global fact may be computed inside `extractEndpointsFromFile` (LSP invariant).
- Comments explain **what**, two lines max. No `Co-Authored-By`/`Claude-Session` trailers. Conventional Commits.
- `pnpm check && pnpm typecheck && pnpm test && pnpm build` must pass before claiming done. Never `--no-verify`.

---

### Task 1: Shared guard-facts builder

**Files:**
- Create: `packages/nestjs-doctor/src/engine/graph/guard-facts.ts`
- Modify: `packages/nestjs-doctor/src/engine/diagnostician.ts:120-184` (`fileRuleFacts`)
- Modify: `packages/nestjs-doctor/src/engine/rules/definitions/security/require-guards-on-endpoints.ts:9-28`
- Test: `packages/nestjs-doctor/tests/unit/guard-facts.test.ts`

**Interfaces:**
- Consumes: `GuardFacts` (`src/engine/rules/types.ts:29-36`), `GuardDecoratorIndex`/`guardDecoratorNames` (`src/engine/graph/guard-decorators.ts`), `ModuleGraph` (`src/engine/graph/module-graph.ts`).
- Produces: `buildGuardFacts(astProject: Project, files: string[], moduleGraph: ModuleGraph, guardDecorators: GuardDecoratorIndex): GuardFacts`; `PUBLIC_DECORATORS: ReadonlySet<string>`; `hasGuardDecorator(node: ClassDeclaration | MethodDeclaration, composedDecorators: ReadonlySet<string>): boolean`. Task 3 imports all three.

This is a pure extraction — behaviour must not change. The logic moves verbatim from `fileRuleFacts` (diagnostician.ts:149-181): `composedDecorators` from `guardDecoratorNames(guardDecorators)`, `guardedBaseClasses` from the per-class base-scan, `globallyRegistered` from `modules.some(m => m.providerTokens.includes("APP_GUARD"))`. `PUBLIC_DECORATORS` and the `hasGuard` helper move out of the rule (rename `hasGuard` → `hasGuardDecorator`, second parameter becomes the set, not `GuardFacts`); the rule imports them.

- [ ] **Step 1: Write the failing test**

```ts
// packages/nestjs-doctor/tests/unit/guard-facts.test.ts
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildGuardDecoratorIndex } from "../../src/engine/graph/guard-decorators.js";
import { buildGuardFacts } from "../../src/engine/graph/guard-facts.js";
import { buildModuleGraph } from "../../src/engine/graph/module-graph.js";

function setup(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	// Mirror the pathAliases argument shape used in tests/unit/module-graph.test.ts
	const moduleGraph = buildModuleGraph(project, paths, new Map());
	const guardDecorators = buildGuardDecoratorIndex(project, paths);
	return buildGuardFacts(project, paths, moduleGraph, guardDecorators);
}

describe("buildGuardFacts", () => {
	it("detects APP_GUARD registration", () => {
		const facts = setup({
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				import { APP_GUARD } from '@nestjs/core';
				@Module({ providers: [{ provide: APP_GUARD, useClass: AuthGuard }] })
				export class AppModule {}
			`,
		});
		expect(facts.globallyRegistered).toBe(true);
	});

	it("reports no global guard for a plain module", () => {
		const facts = setup({
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({ providers: [SomeService] })
				export class AppModule {}
			`,
		});
		expect(facts.globallyRegistered).toBe(false);
	});

	it("collects decorators composing UseGuards and guarded base classes", () => {
		const facts = setup({
			"auth.decorator.ts": `
				import { applyDecorators, UseGuards } from '@nestjs/common';
				export function Auth() {
					return applyDecorators(UseGuards(JwtGuard));
				}
			`,
			"admin.controller.ts": `
				import { Controller, UseGuards } from '@nestjs/common';
				@Controller('admin')
				@UseGuards(JwtGuard)
				export class AdminController extends BaseController {}
			`,
		});
		expect(facts.composedDecorators.has("Auth")).toBe(true);
		expect(facts.guardedBaseClasses.has("BaseController")).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/guard-facts.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/graph/guard-facts.js`.

- [ ] **Step 3: Create `guard-facts.ts` and rewire consumers**

```ts
// packages/nestjs-doctor/src/engine/graph/guard-facts.ts
import type { ClassDeclaration, MethodDeclaration, Project } from "ts-morph";
import type { GuardFacts } from "../rules/types.js";
import {
	type GuardDecoratorIndex,
	guardDecoratorNames,
} from "./guard-decorators.js";
import type { ModuleGraph } from "./module-graph.js";

/** Decorator names that mark a route as intentionally public. */
export const PUBLIC_DECORATORS: ReadonlySet<string> = new Set([
	"Public",
	"AllowAnonymous",
	"SkipAuth",
	"IsPublic",
]);

/** True for `@UseGuards()` or a decorator known to compose it. */
export function hasGuardDecorator(
	node: ClassDeclaration | MethodDeclaration,
	composedDecorators: ReadonlySet<string>
): boolean {
	return node
		.getDecorators()
		.some(
			(decorator) =>
				decorator.getName() === "UseGuards" ||
				composedDecorators.has(decorator.getName())
		);
}

export function buildGuardFacts(
	astProject: Project,
	files: string[],
	moduleGraph: ModuleGraph,
	guardDecorators: GuardDecoratorIndex
): GuardFacts {
	const composedDecorators = guardDecoratorNames(guardDecorators);

	const guardedBaseClasses = new Set<string>();
	for (const filePath of files) {
		const sourceFile = astProject.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}
		for (const cls of sourceFile.getClasses()) {
			const base = cls.getExtends()?.getExpression().getText();
			if (!base) {
				continue;
			}
			if (hasGuardDecorator(cls, composedDecorators)) {
				guardedBaseClasses.add(base.split("<")[0].split(".").pop() ?? base);
			}
		}
	}

	return {
		composedDecorators,
		globallyRegistered: [...moduleGraph.modules.values()].some((module) =>
			module.providerTokens.includes("APP_GUARD")
		),
		guardedBaseClasses,
	};
}
```

In `diagnostician.ts`, delete the moved block from `fileRuleFacts` (lines 149-181) and replace with:

```ts
const guards = buildGuardFacts(
	context.astProject,
	context.files,
	context.moduleGraph,
	context.guardDecorators
);
```

returning `{ diProviders, guards, moduleDirectories }`. Remove the now-unused `guardDecoratorNames` import if nothing else uses it.

In `require-guards-on-endpoints.ts`, delete the local `PUBLIC_DECORATORS` and `hasGuard`, import `PUBLIC_DECORATORS` and `hasGuardDecorator` from `../../../graph/guard-facts.js`, and replace `hasGuard(cls, context.guards)` with `hasGuardDecorator(cls, context.guards?.composedDecorators ?? new Set())` (same for the method call).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/guard-facts.test.ts tests/unit` (full unit suite — this task must not change rule behaviour; the security-rule tests are the regression net).
Expected: PASS, no unrelated failures.

- [ ] **Step 5: Commit**

```bash
git add packages/nestjs-doctor/src/engine/graph/guard-facts.ts packages/nestjs-doctor/src/engine/diagnostician.ts packages/nestjs-doctor/src/engine/rules/definitions/security/require-guards-on-endpoints.ts packages/nestjs-doctor/tests/unit/guard-facts.test.ts
git commit -m "refactor(engine): extract guard facts into shared builder"
```

---

### Task 2: Route-path arrays and multiple route decorators

**Files:**
- Modify: `packages/nestjs-doctor/src/engine/graph/endpoint-graph.ts:594-640` (`extractControllerPath`, `extractRouteInfo`) and `:1906-1980` (`extractEndpointsFromFile`)
- Test: `packages/nestjs-doctor/tests/unit/endpoint-graph.test.ts` (append)

**Interfaces:**
- Consumes: `QUOTE_REGEX` (endpoint-graph.ts:32), `HTTP_DECORATORS` (imported from nest-class-inspector), `composePath` (endpoint-graph.ts:642).
- Produces: `extractControllerPaths(cls): string[]` (plural, replaces `extractControllerPath`) and `extractRouteInfos(method): { httpMethod: string; path: string }[]` (plural, replaces `extractRouteInfo`). Internal helper `literalPaths(node): string[]`.

Today `@Controller(['admin','manage'])` renders the array literal as text (`/['admin', 'manage']/x`) and a second route decorator on a handler is silently dropped (first-match return at :637).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/endpoint-graph.test.ts` (reuse the existing `createProject` helper and `resolveProviders` import at the top of the file):

```ts
describe("route extraction", () => {
	it("emits one endpoint per controller path in a path array", () => {
		const { project, paths } = createProject({
			"multi.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller(['admin', 'manage'])
				export class MultiController {
					@Get('users')
					list() { return []; }
				}
			`,
		});
		const graph = buildEndpointGraph(project, paths, resolveProviders(project, paths));
		const routes = graph.endpoints.map((e) => e.routePath).sort();
		expect(routes).toEqual(["/admin/users", "/manage/users"]);
	});

	it("emits one endpoint per method path in a path array", () => {
		const { project, paths } = createProject({
			"alias.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('items')
				export class AliasController {
					@Get(['all', 'list'])
					list() { return []; }
				}
			`,
		});
		const graph = buildEndpointGraph(project, paths, resolveProviders(project, paths));
		const routes = graph.endpoints.map((e) => e.routePath).sort();
		expect(routes).toEqual(["/items/all", "/items/list"]);
	});

	it("emits one endpoint per route decorator on a handler", () => {
		const { project, paths } = createProject({
			"dual.controller.ts": `
				import { Controller, Get, Post } from '@nestjs/common';
				@Controller('dual')
				export class DualController {
					@Get('x')
					@Post('x')
					both() { return []; }
				}
			`,
		});
		const graph = buildEndpointGraph(project, paths, resolveProviders(project, paths));
		const methods = graph.endpoints.map((e) => e.httpMethod).sort();
		expect(methods).toEqual(["GET", "POST"]);
	});

	it("keeps single-path controllers unchanged", () => {
		const { project, paths } = createProject({
			"plain.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('plain')
				export class PlainController {
					@Get()
					root() { return []; }
				}
			`,
		});
		const graph = buildEndpointGraph(project, paths, resolveProviders(project, paths));
		expect(graph.endpoints.map((e) => e.routePath)).toEqual(["/plain"]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/endpoint-graph.test.ts`
Expected: the three new array/multi tests FAIL (garbage path text / one endpoint instead of two); the single-path test passes.

- [ ] **Step 3: Implement**

Add `literalPaths` next to `extractControllerPath` and convert both extractors to plural:

```ts
/** String paths from a decorator argument: a literal, or each element of an array literal. */
function literalPaths(node: Node): string[] {
	const array = node.asKind(SyntaxKind.ArrayLiteralExpression);
	if (array) {
		const paths = array
			.getElements()
			.map((element) => element.getText().replace(QUOTE_REGEX, ""));
		return paths.length > 0 ? paths : [""];
	}
	return [node.getText().replace(QUOTE_REGEX, "")];
}

function extractControllerPaths(cls: ClassDeclaration): string[] {
	const decorator = cls.getDecorator("Controller");
	if (!decorator) {
		return [""];
	}
	const args = decorator.getArguments();
	if (args.length === 0) {
		return [""];
	}
	const obj = args[0].asKind(SyntaxKind.ObjectLiteralExpression);
	if (obj) {
		const init = obj
			.getProperty("path")
			?.asKind(SyntaxKind.PropertyAssignment)
			?.getInitializer();
		return init ? literalPaths(init) : [""];
	}
	return literalPaths(args[0]);
}

function extractRouteInfos(
	method: MethodDeclaration
): { httpMethod: string; path: string }[] {
	const routes: { httpMethod: string; path: string }[] = [];
	for (const decorator of method.getDecorators()) {
		const name = decorator.getName();
		if (!HTTP_DECORATORS.has(name)) {
			continue;
		}
		const args = decorator.getArguments();
		const paths = args.length > 0 ? literalPaths(args[0]) : [""];
		for (const path of paths) {
			routes.push({ httpMethod: name.toUpperCase(), path });
		}
	}
	return routes;
}
```

In `extractEndpointsFromFile` (:1922-1976): `controllerPath` becomes `controllerPaths = isCtrl ? extractControllerPaths(cls) : [""]`; the per-method block becomes:

```ts
const resolverRoute = isRes ? extractResolverRouteInfo(method) : undefined;
const routeInfos = isCtrl
	? extractRouteInfos(method)
	: resolverRoute
		? [resolverRoute]
		: [];
if (routeInfos.length === 0) {
	continue;
}
```

Compute `scanResult`, `budget`, `dependencies`, `swagger`, `returnType` **once per method** (exactly the existing code), then:

```ts
for (const routeInfo of routeInfos) {
	for (const controllerPath of controllerPaths) {
		endpoints.push({
			controllerClass: controllerName,
			dependencies,
			endLine: method.getEndLineNumber(),
			filePath,
			handlerMethod: method.getName(),
			httpMethod: routeInfo.httpMethod,
			line: method.getStartLineNumber(),
			returnType,
			routePath: isCtrl ? composePath(controllerPath, routeInfo.path) : routeInfo.path,
			swagger,
			...(budget.exhausted ? { truncated: true as const } : {}),
		});
	}
}
```

(For resolvers `controllerPaths` is `[""]`, so exactly one endpoint per op — unchanged.) Delete the old singular functions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/endpoint-graph.test.ts && pnpm --filter nestjs-doctor test`
Expected: PASS. If an existing test asserted the old garbage array-literal path, fix that test — the old output was a bug.

- [ ] **Step 5: Commit**

```bash
git add packages/nestjs-doctor/src/engine/graph/endpoint-graph.ts packages/nestjs-doctor/tests/unit/endpoint-graph.test.ts
git commit -m "fix(engine): handle path arrays and multiple route decorators in endpoint extraction"
```

---

### Task 3: Auth + module annotation pass

**Files:**
- Modify: `packages/nestjs-doctor/src/common/endpoint.ts` (types)
- Create: `packages/nestjs-doctor/src/engine/graph/endpoint-annotations.ts`
- Modify: `packages/nestjs-doctor/src/engine/result-builder.ts:85-123` (`buildResult`)
- Test: `packages/nestjs-doctor/tests/unit/endpoint-annotations.test.ts`

**Interfaces:**
- Consumes: `buildGuardFacts`, `PUBLIC_DECORATORS`, `hasGuardDecorator` (Task 1); `ModuleGraph.modules` / `.providerToModule`; `EndpointGraph`.
- Produces: types `EndpointAuthState`, `EndpointAuth`; new optional `EndpointNode` fields `auth?: EndpointAuth`, `module?: string | null`, `project?: string`; `annotateEndpoints(graph: EndpointGraph, astProject: Project, guardFacts: GuardFacts, moduleGraph: ModuleGraph): void` (mutates nodes in place). Task 4 and PR 2 rely on these exact names.

Runs in `buildResult` only — after all graphs exist. The LSP's `updateFile` path never sees it; re-annotation happens on every `buildResult`, so stale auth is impossible in report output.

- [ ] **Step 1: Add types to `src/common/endpoint.ts`**

After `SwaggerMetadata` (line 109), add:

```ts
export type EndpointAuthState =
	| "guarded"
	| "declared-public"
	| "unguarded"
	| "unknown";

/**
 * Auth coverage derived from decorators. `globalGuard` is a project-level
 * fact (an APP_GUARD is registered somewhere), not per-endpoint certainty.
 */
export interface EndpointAuth {
	globalGuard: boolean;
	/** Guard class names from direct `@UseGuards(Identifier)` arguments only. */
	guardNames: string[];
	state: EndpointAuthState;
}
```

In `EndpointNode`, after `swagger`, add:

```ts
	/** Auth coverage; absent until the annotation pass has run. */
	auth?: EndpointAuth;
	/** Owning module class name; null when attribution found no module. */
	module?: string | null;
	/** Sub-project name, set only in a monorepo combined result. */
	project?: string;
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/nestjs-doctor/tests/unit/endpoint-annotations.test.ts
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildEndpointGraph } from "../../src/engine/graph/endpoint-graph.js";
import { annotateEndpoints } from "../../src/engine/graph/endpoint-annotations.js";
import { buildGuardDecoratorIndex } from "../../src/engine/graph/guard-decorators.js";
import { buildGuardFacts } from "../../src/engine/graph/guard-facts.js";
import { buildModuleGraph } from "../../src/engine/graph/module-graph.js";
import { resolveProviders } from "../../src/engine/graph/type-resolver.js";

function annotate(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	const moduleGraph = buildModuleGraph(project, paths, new Map());
	const graph = buildEndpointGraph(project, paths, resolveProviders(project, paths));
	const facts = buildGuardFacts(
		project,
		paths,
		moduleGraph,
		buildGuardDecoratorIndex(project, paths)
	);
	annotateEndpoints(graph, project, facts, moduleGraph);
	return graph.endpoints;
}

const CATS_MODULE = `
	import { Module } from '@nestjs/common';
	import { CatsController } from './cats.controller';
	@Module({ controllers: [CatsController] })
	export class CatsModule {}
`;

describe("annotateEndpoints", () => {
	it("marks class-level UseGuards as guarded with guard names", () => {
		const eps = annotate({
			"cats.controller.ts": `
				import { Controller, Get, UseGuards } from '@nestjs/common';
				@Controller('cats')
				@UseGuards(JwtGuard)
				export class CatsController {
					@Get() list() { return []; }
				}
			`,
			"cats.module.ts": CATS_MODULE,
		});
		expect(eps[0].auth).toEqual({
			globalGuard: false,
			guardNames: ["JwtGuard"],
			state: "guarded",
		});
		expect(eps[0].module).toBe("CatsModule");
	});

	it("distinguishes declared-public from unguarded", () => {
		const eps = annotate({
			"cats.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('cats')
				export class CatsController {
					@Get('open')
					@Public()
					open() { return []; }
					@Get('bare')
					bare() { return []; }
				}
			`,
		});
		const byMethod = new Map(eps.map((e) => [e.handlerMethod, e]));
		expect(byMethod.get("open")?.auth?.state).toBe("declared-public");
		expect(byMethod.get("bare")?.auth?.state).toBe("unguarded");
		expect(byMethod.get("bare")?.module).toBeNull();
	});

	it("carries APP_GUARD as globalGuard without flipping state", () => {
		const eps = annotate({
			"cats.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('cats')
				export class CatsController {
					@Get() list() { return []; }
				}
			`,
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				import { APP_GUARD } from '@nestjs/core';
				@Module({ providers: [{ provide: APP_GUARD, useClass: AuthGuard }] })
				export class AppModule {}
			`,
		});
		expect(eps[0].auth?.state).toBe("unguarded");
		expect(eps[0].auth?.globalGuard).toBe(true);
	});

	it("skips non-identifier UseGuards arguments in guardNames but stays guarded", () => {
		const eps = annotate({
			"cats.controller.ts": `
				import { Controller, Get, UseGuards } from '@nestjs/common';
				@Controller('cats')
				export class CatsController {
					@Get()
					@UseGuards(AuthGuard('jwt'))
					list() { return []; }
				}
			`,
		});
		expect(eps[0].auth?.state).toBe("guarded");
		expect(eps[0].auth?.guardNames).toEqual([]);
	});

	it("attributes resolver endpoints through providerToModule", () => {
		const eps = annotate({
			"cats.resolver.ts": `
				import { Resolver, Query } from '@nestjs/graphql';
				@Resolver()
				export class CatsResolver {
					@Query() cats() { return []; }
				}
			`,
			"cats.module.ts": `
				import { Module } from '@nestjs/common';
				import { CatsResolver } from './cats.resolver';
				@Module({ providers: [CatsResolver] })
				export class CatsModule {}
			`,
		});
		expect(eps[0].module).toBe("CatsModule");
		expect(eps[0].auth?.state).toBe("unguarded");
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/endpoint-annotations.test.ts`
Expected: FAIL — cannot resolve `endpoint-annotations.js`.

- [ ] **Step 4: Implement the pass**

```ts
// packages/nestjs-doctor/src/engine/graph/endpoint-annotations.ts
import type { ClassDeclaration, Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
	EndpointAuth,
	EndpointGraph,
	EndpointNode,
} from "../../common/endpoint.js";
import type { GuardFacts } from "../rules/types.js";
import { hasGuardDecorator, PUBLIC_DECORATORS } from "./guard-facts.js";
import type { ModuleGraph } from "./module-graph.js";

/** Guard class names written as plain identifiers in `@UseGuards(...)`. */
function directGuardNames(node: ClassDeclaration | MethodDeclarationLike): string[] {
	const names: string[] = [];
	for (const decorator of node.getDecorators()) {
		if (decorator.getName() !== "UseGuards") {
			continue;
		}
		for (const argument of decorator.getArguments()) {
			if (argument.getKind() === SyntaxKind.Identifier) {
				names.push(argument.getText());
			}
		}
	}
	return names;
}
```

(`MethodDeclarationLike` is shorthand here — use the concrete ts-morph `MethodDeclaration` type in a union, matching `hasGuardDecorator`'s signature.)

```ts
function hasPublicDecorator(node: ClassDeclaration | MethodDeclaration): boolean {
	return node
		.getDecorators()
		.some((decorator) => PUBLIC_DECORATORS.has(decorator.getName()));
}

function computeAuth(
	endpoint: EndpointNode,
	astProject: Project,
	facts: GuardFacts
): EndpointAuth {
	const globalGuard = facts.globallyRegistered;
	const cls = astProject
		.getSourceFile(endpoint.filePath)
		?.getClass(endpoint.controllerClass);
	const method = cls?.getMethod(endpoint.handlerMethod);
	if (!(cls && method)) {
		return { globalGuard, guardNames: [], state: "unknown" };
	}

	const composed = facts.composedDecorators;
	const guardNames = [...directGuardNames(cls), ...directGuardNames(method)];

	// Precedence mirrors security/require-guards-on-endpoints.
	if (hasGuardDecorator(cls, composed)) {
		return { globalGuard, guardNames, state: "guarded" };
	}
	const name = cls.getName();
	if (name && facts.guardedBaseClasses.has(name)) {
		return { globalGuard, guardNames, state: "guarded" };
	}
	if (hasPublicDecorator(cls)) {
		return { globalGuard, guardNames, state: "declared-public" };
	}
	if (hasGuardDecorator(method, composed)) {
		return { globalGuard, guardNames, state: "guarded" };
	}
	if (hasPublicDecorator(method)) {
		return { globalGuard, guardNames, state: "declared-public" };
	}
	return { globalGuard, guardNames, state: "unguarded" };
}

function resolveModule(
	endpoint: EndpointNode,
	controllerToModule: Map<string, string>,
	moduleGraph: ModuleGraph
): string | null {
	return (
		controllerToModule.get(endpoint.controllerClass) ??
		moduleGraph.providerToModule.get(endpoint.controllerClass)?.name ??
		null
	);
}

export function annotateEndpoints(
	graph: EndpointGraph,
	astProject: Project,
	guardFacts: GuardFacts,
	moduleGraph: ModuleGraph
): void {
	const controllerToModule = new Map<string, string>();
	for (const module of moduleGraph.modules.values()) {
		for (const controller of module.controllers) {
			controllerToModule.set(controller, module.name);
		}
	}
	for (const endpoint of graph.endpoints) {
		endpoint.auth = computeAuth(endpoint, astProject, guardFacts);
		endpoint.module = resolveModule(endpoint, controllerToModule, moduleGraph);
	}
}
```

Check `ModuleNode`'s name field: the map at module-graph.ts:167 is keyed by `node.name` — confirm the property is `name` (read `ModuleNode` at module-graph.ts:62-75 before writing) and adjust if it differs.

In `buildResult` (result-builder.ts, before constructing `result` at :101):

```ts
annotateEndpoints(
	context.endpointGraph,
	context.astProject,
	buildGuardFacts(
		context.astProject,
		context.files,
		context.moduleGraph,
		context.guardDecorators
	),
	context.moduleGraph
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/endpoint-annotations.test.ts && pnpm --filter nestjs-doctor test`
Expected: PASS. Integration tests that snapshot `DiagnoseResult` may need updating for the new fields — update snapshots only after eyeballing that the added fields are correct.

- [ ] **Step 6: Commit**

```bash
git add packages/nestjs-doctor/src/common/endpoint.ts packages/nestjs-doctor/src/engine/graph/endpoint-annotations.ts packages/nestjs-doctor/src/engine/result-builder.ts packages/nestjs-doctor/tests/unit/endpoint-annotations.test.ts
git commit -m "feat(engine): annotate endpoints with auth state and module ownership"
```

---

### Task 4: Monorepo attribution, changeset, full verification

**Files:**
- Modify: `packages/nestjs-doctor/src/engine/result-builder.ts:125-200` (`buildMonorepoResult`)
- Create: `.changeset/endpoint-auth-metadata.md`
- Test: `packages/nestjs-doctor/tests/unit/` — extend the existing test covering `buildMonorepoResult` (find it with `grep -rln buildMonorepoResult packages/nestjs-doctor/tests`); if none exists, add the case to `endpoint-annotations.test.ts` calling `buildMonorepoResult` directly with two minimal `buildResult`-shaped fixtures.

**Interfaces:**
- Consumes: `EndpointNode.module` / `.project` (Task 3); the `scanResults: Map<string, ...>` iteration in `buildMonorepoResult` where `allEndpoints` is filled (result-builder.ts:160-161).
- Produces: combined-result endpoints carrying `project: <subProjectName>` and `module: "<subProjectName>/<ModuleName>"` — the exact key format the merged module graph uses (module-graph.ts:788-802).

- [ ] **Step 1: Write the failing test**

The merged module graph prefixes module names with `${projectName}/`; combined endpoints must match or the UI join fails silently. Test that after `buildMonorepoResult`, an endpoint from sub-project `api` whose module was `CatsModule` has `project === "api"` and `module === "api/CatsModule"`, and an endpoint with `module: null` keeps `null` (no `"api/null"` strings).

```ts
it("prefixes combined endpoint modules with the sub-project name", () => {
	// Build two sub-project results via buildResult on small in-memory contexts,
	// or construct minimal EngineResult-shaped objects if buildResult needs too
	// much scaffolding — assert on combined.endpoints only.
	const combined = buildMonorepoResult(scanResults, [], 0);
	const endpoint = combined.combined.endpoints?.endpoints.find(
		(e) => e.controllerClass === "CatsController"
	);
	expect(endpoint?.project).toBe("api");
	expect(endpoint?.module).toBe("api/CatsModule");
	const orphan = combined.combined.endpoints?.endpoints.find(
		(e) => e.controllerClass === "LooseController"
	);
	expect(orphan?.module).toBeNull();
});
```

Adapt the fixture construction to whatever the existing `buildMonorepoResult` test does — mirror it exactly rather than inventing a new scaffold.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter nestjs-doctor exec vitest run <that test file>`
Expected: FAIL — `project` undefined, `module` unprefixed.

- [ ] **Step 3: Implement**

At the `allEndpoints.push(...scanResult.result.endpoints.endpoints)` site (result-builder.ts:160-161), which sits inside the loop over `scanResults` entries (the sub-project name is the map key):

```ts
if (scanResult.result.endpoints) {
	for (const endpoint of scanResult.result.endpoints.endpoints) {
		allEndpoints.push({
			...endpoint,
			module: endpoint.module ? `${name}/${endpoint.module}` : (endpoint.module ?? null),
			project: name,
		});
	}
}
```

(Spread, don't mutate — the per-sub-project result keeps its unprefixed names.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter nestjs-doctor test`
Expected: PASS.

- [ ] **Step 5: Add the changeset**

```markdown
<!-- .changeset/endpoint-auth-metadata.md -->
---
"nestjs-doctor": minor
---

Endpoints now carry decorator-derived auth state (`auth`: guarded / declared-public / unguarded / unknown, plus direct guard names and a project-level APP_GUARD flag), owning module (`module`), and sub-project attribution (`project`) in monorepo combined results. Controller and route path arrays (`@Controller(['a','b'])`, `@Get(['x','y'])`) and multiple route decorators per handler now produce one endpoint per path/decorator instead of garbled or missing routes. All new `EndpointNode` fields are optional — existing consumers are unaffected.
```

- [ ] **Step 6: Full verification**

Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass. Then run the CLI against a fixture to eyeball real output:
`node packages/nestjs-doctor/dist/cli/index.js packages/nestjs-doctor/tests/fixtures/endpoint-graph-patterns --json | head -80` — confirm endpoints carry `auth` and `module`.

- [ ] **Step 7: Commit**

```bash
git add packages/nestjs-doctor/src/engine/result-builder.ts .changeset/endpoint-auth-metadata.md packages/nestjs-doctor/tests
git commit -m "feat(engine): attribute combined endpoints to sub-projects and add changeset"
```
