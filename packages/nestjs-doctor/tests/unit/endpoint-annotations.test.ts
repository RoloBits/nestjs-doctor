import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { annotateEndpoints } from "../../src/engine/graph/endpoint-annotations.js";
import { buildEndpointGraph } from "../../src/engine/graph/endpoint-graph.js";
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
