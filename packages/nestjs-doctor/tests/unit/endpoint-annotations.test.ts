import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { EndpointNode } from "../../src/common/endpoint.js";
import { annotateEndpoints } from "../../src/engine/graph/endpoint-annotations.js";
import { buildEndpointGraph } from "../../src/engine/graph/endpoint-graph.js";
import { buildGuardDecoratorIndex } from "../../src/engine/graph/guard-decorators.js";
import { buildGuardFacts } from "../../src/engine/graph/guard-facts.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { buildModuleGraph } from "../../src/engine/graph/module-graph.js";
import { resolveProviders } from "../../src/engine/graph/type-resolver.js";
import {
	buildMonorepoResult,
	type EngineResult,
} from "../../src/engine/result-builder.js";

function annotate(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	const moduleGraph = buildModuleGraph(project, paths, new Map());
	const graph = buildEndpointGraph(
		project,
		paths,
		resolveProviders(project, paths)
	);
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

	it("does not credit a concrete controller's own endpoints via a guarded subclass", () => {
		const eps = annotate({
			"cats.controller.ts": `
				import { Controller, Get, UseGuards } from '@nestjs/common';
				@Controller('cats')
				export class CatsController {
					@Get() list() { return []; }
				}
				@UseGuards(JwtGuard)
				export class AdminCatsController extends CatsController {}
			`,
		});
		expect(eps[0].auth?.state).toBe("unguarded");
	});

	it("dedups guard names shared between class and method level", () => {
		const eps = annotate({
			"cats.controller.ts": `
				import { Controller, Get, UseGuards } from '@nestjs/common';
				@Controller('cats')
				@UseGuards(JwtGuard)
				export class CatsController {
					@Get()
					@UseGuards(JwtGuard)
					list() { return []; }
				}
			`,
		});
		expect(eps[0].auth?.guardNames).toEqual(["JwtGuard"]);
	});

	it("marks an unresolvable controller class as unknown auth state", () => {
		const eps = annotate({
			"cats.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('cats')
				export default class {
					@Get() list() { return []; }
				}
			`,
		});
		expect(eps[0].auth).toEqual({
			globalGuard: false,
			guardNames: [],
			state: "unknown",
		});
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

function fakeModuleGraph(): ModuleGraph {
	return {
		edges: new Map(),
		modules: new Map(),
		providerToModule: new Map(),
	};
}

function fakeEndpoint(overrides: Partial<EndpointNode>): EndpointNode {
	return {
		controllerClass: "CatsController",
		dependencies: [],
		endLine: 1,
		filePath: "cats.controller.ts",
		handlerMethod: "list",
		httpMethod: "GET",
		line: 1,
		returnType: null,
		routePath: "cats",
		swagger: null,
		...overrides,
	};
}

function fakeScanResult(name: string, endpoints: EndpointNode[]): EngineResult {
	return {
		customRuleWarnings: [],
		files: [],
		moduleGraph: fakeModuleGraph(),
		providers: new Map(),
		result: {
			diagnostics: [],
			elapsedMs: 0,
			endpoints: { endpoints },
			project: {
				fileCount: 0,
				framework: null,
				moduleCount: 0,
				name,
				nestVersion: null,
				orm: null,
			},
			ruleErrors: [],
			score: { label: "A", value: 100 },
			summary: {
				byCategory: {
					architecture: 0,
					correctness: 0,
					performance: 0,
					schema: 0,
					security: 0,
				},
				errors: 0,
				info: 0,
				total: 0,
				warnings: 0,
			},
		},
	};
}

describe("buildMonorepoResult", () => {
	it("prefixes combined endpoint modules with the sub-project name", () => {
		const scanResults = new Map([
			[
				"api",
				fakeScanResult("api", [
					fakeEndpoint({
						controllerClass: "CatsController",
						module: "CatsModule",
					}),
					fakeEndpoint({
						controllerClass: "LooseController",
						module: null,
					}),
				]),
			],
		]);
		const combined = buildMonorepoResult(scanResults, [], 0);
		const endpoint = combined.result.combined.endpoints?.endpoints.find(
			(e) => e.controllerClass === "CatsController"
		);
		expect(endpoint?.project).toBe("api");
		expect(endpoint?.module).toBe("api/CatsModule");
		const orphan = combined.result.combined.endpoints?.endpoints.find(
			(e) => e.controllerClass === "LooseController"
		);
		expect(orphan?.project).toBe("api");
		expect(orphan?.module).toBeNull();
	});
});
