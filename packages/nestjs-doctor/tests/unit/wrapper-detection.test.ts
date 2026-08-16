import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildEndpointGraph } from "../../src/engine/graph/endpoint-graph.js";
import { collectEntryModules } from "../../src/engine/graph/entry-points.js";
import {
	buildModuleGraph,
	type ModuleGraph,
	mergeModuleGraphs,
	updateModuleGraphForFile,
} from "../../src/engine/graph/module-graph.js";
import { resolveProviders } from "../../src/engine/graph/type-resolver.js";
import {
	isController,
	isHttpHandler,
} from "../../src/engine/nest-class-inspector.js";
import { runProjectRules } from "../../src/engine/rule-runner.js";
import { noOrphanModules } from "../../src/engine/rules/definitions/performance/no-orphan-modules.js";
import { noUnusedProviders } from "../../src/engine/rules/definitions/performance/no-unused-providers.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

const REST_WRAPPERS = `
	import { applyDecorators, Controller, Get } from '@nestjs/common';
	import { ApiOkResponse } from '@nestjs/swagger';
	export function MyRestController(options?: { path?: string }) {
		return applyDecorators(Controller(options ?? {}));
	}
	export function MyReadOneOk(type: unknown, description?: string, path?: string) {
		return applyDecorators(Get(path), ApiOkResponse({ description }));
	}
`;

const WRAPPED_CONTROLLER = `
	import { MyRestController, MyReadOneOk } from './rest';
	@MyRestController({ path: 'health' })
	export class HealthController {
		constructor(private readonly billingService: BillingService) {}
		@MyReadOneOk(Object)
		async health() {
			return { ok: true };
		}
	}
`;

describe("wrapper decorator resolution", () => {
	it("recognizes a class decorated with a wrapper that composes Controller()", () => {
		const { project } = createProject({
			"rest.ts": REST_WRAPPERS,
			"health.controller.ts": WRAPPED_CONTROLLER,
		});
		const cls = project
			.getSourceFileOrThrow("health.controller.ts")
			.getClasses()[0];
		expect(isController(cls)).toBe(true);
		expect(cls.getMethods().some(isHttpHandler)).toBe(true);
	});

	it("traces endpoints through wrapper decorators, path included", () => {
		const { project, paths } = createProject({
			"rest.ts": REST_WRAPPERS,
			"health.controller.ts": WRAPPED_CONTROLLER,
		});
		const graph = buildEndpointGraph(project, paths, new Map());
		const endpoint = graph.endpoints.find(
			(e) => e.controllerClass === "HealthController"
		);
		expect(endpoint).toBeDefined();
		expect(endpoint?.httpMethod).toBe("GET");
		expect(endpoint?.routePath).toBe("/health");
	});
});

describe("bootstrap wrapper entry points", () => {
	it("counts a module handed to a *bootstrap*() helper as an application root", () => {
		const { project, paths } = createProject({
			"standalone.ts": `
				import { Module } from '@nestjs/common';
				import { standaloneBootstrap } from './helper';
				import { CoreModule } from './core.module';
				@Module({ imports: [CoreModule] })
				export class BootstrapModule {}
				standaloneBootstrap(BootstrapModule);
			`,
			"helper.ts": `
				import { NestFactory } from '@nestjs/core';
				export async function standaloneBootstrap(mod: unknown) {
					const app = await NestFactory.create(mod);
					return app;
				}
			`,
			"core.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class CoreModule {}
			`,
		});
		const graph = buildModuleGraph(project, paths);
		const entries = collectEntryModules(project, paths, graph);
		expect(entries.has("BootstrapModule")).toBe(true);
	});

	it("resolves an arbitrarily named helper whose implementation calls NestFactory", () => {
		const { project, paths } = createProject({
			"main.ts": `
				import { Module } from '@nestjs/common';
				import { launchApp } from './launcher';
				@Module({})
				export class RootishModule {}
				launchApp(RootishModule);
			`,
			"launcher.ts": `
				import { NestFactory } from '@nestjs/core';
				export async function launchApp(mod: unknown) {
					const app = await NestFactory.create(mod);
					await app.listen(3000);
				}
			`,
		});
		const graph = buildModuleGraph(project, paths);
		const entries = collectEntryModules(project, paths, graph);
		expect(entries.has("RootishModule")).toBe(true);
	});
});

describe("same-name module declarations", () => {
	it("unions the metadata of two @Module classes sharing one name", () => {
		const { project, paths } = createProject({
			"standalone.ts": `
				import { Module } from '@nestjs/common';
				import { AppModule } from './app.module';
				@Module({ imports: [AppModule] })
				export class BootstrapModule {}
			`,
			"lambda.ts": `
				import { Module } from '@nestjs/common';
				import { AppModule } from './app.module';
				import { DatadogModule } from './datadog.module';
				@Module({ imports: [DatadogModule, AppModule] })
				export class BootstrapModule {}
			`,
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class AppModule {}
			`,
			"datadog.module.ts": `
				import { Global, Module } from '@nestjs/common';
				@Global()
				@Module({})
				export class DatadogModule {}
			`,
		});
		const graph = buildModuleGraph(project, paths);
		const bootstrap = graph.modules.get("BootstrapModule");
		expect(bootstrap?.imports.sort()).toEqual(["AppModule", "DatadogModule"]);
		expect(graph.edges.get("BootstrapModule")).toEqual(
			new Set(["AppModule", "DatadogModule"])
		);
	});

	it("keeps a module imported only by the second declaration out of the orphan findings", () => {
		const { project, paths } = createProject({
			"standalone.ts": `
				import { Module } from '@nestjs/common';
				import { AppModule } from './app.module';
				@Module({ imports: [AppModule] })
				export class BootstrapModule {}
			`,
			"lambda.ts": `
				import { Module } from '@nestjs/common';
				import { AppModule } from './app.module';
				import { DatadogModule } from './datadog.module';
				@Module({ imports: [DatadogModule, AppModule] })
				export class BootstrapModule {}
			`,
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class AppModule {}
			`,
			"datadog.module.ts": `
				import { Global, Module } from '@nestjs/common';
				@Global()
				@Module({})
				export class DatadogModule {}
			`,
		});
		const moduleGraph = buildModuleGraph(project, paths);
		const { diagnostics } = runProjectRules(project, paths, [noOrphanModules], {
			moduleGraph,
			providers: resolveProviders(project, paths),
		});
		const flagged = diagnostics.map((d) => d.message);
		expect(flagged.join("\n")).not.toContain("DatadogModule");
	});
});

describe("wrapper-decorated controllers as provider consumers", () => {
	it("does not flag a service injected only by a registered wrapper-decorated controller", () => {
		const { project, paths } = createProject({
			"rest.ts": REST_WRAPPERS,
			"billing.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class BillingService {
					charge() { return 1; }
				}
			`,
			"health.controller.ts": `
				import { MyRestController, MyReadOneOk } from './rest';
				import { BillingService } from './billing.service';
				@MyRestController({ path: 'health' })
				export class HealthController {
					constructor(private readonly billingService: BillingService) {}
					@MyReadOneOk(Object)
					async health() {
						return this.billingService.charge();
					}
				}
			`,
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				import { BillingService } from './billing.service';
				import { HealthController } from './health.controller';
				@Module({ controllers: [HealthController], providers: [BillingService] })
				export class AppModule {}
			`,
		});
		const moduleGraph = buildModuleGraph(project, paths);
		const { diagnostics } = runProjectRules(
			project,
			paths,
			[noUnusedProviders],
			{ moduleGraph, providers: resolveProviders(project, paths) }
		);
		expect(diagnostics.map((d) => d.message).join("\n")).not.toContain(
			"BillingService"
		);
	});
});

describe("rule tags", () => {
	it("stamps a rule's tags onto its diagnostics", () => {
		const { project, paths } = createProject({
			"lonely.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class LonelyModule {}
			`,
		});
		const moduleGraph = buildModuleGraph(project, paths);
		const { diagnostics } = runProjectRules(project, paths, [noOrphanModules], {
			moduleGraph,
			providers: resolveProviders(project, paths),
		});
		const lonely = diagnostics.find((d) => d.message.includes("LonelyModule"));
		expect(lonely?.tags).toContain("module-graph");
	});
});

describe("variable-held dynamic imports", () => {
	it("resolves a const holding ConfigModule.forFeature() to the real module", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				import { ConfigModule } from '@nestjs/config';
				const twilioConfigFeature = ConfigModule.forFeature({});
				@Module({ imports: [twilioConfigFeature] })
				export class AppModule {}
			`,
		});
		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule");
		expect(app?.imports).toContain("ConfigModule");
		expect(app?.imports).not.toContain("twilioConfigFeature");
		expect(app?.dynamicImports?.ConfigModule).toBe("forFeature");
	});
});

describe("bootstrap wrapper precision", () => {
	it("does not root modules handed to a bootstrap-named helper that never reaches NestFactory", () => {
		const { project, paths } = createProject({
			"docs.ts": `
				import { Module } from '@nestjs/common';
				import { bootstrapSwagger } from './swagger';
				@Module({})
				export class DocsModule {}
				bootstrapSwagger(DocsModule);
			`,
			"swagger.ts":
				"export function bootstrapSwagger(mod: unknown) { return { mod }; }",
		});
		const graph = buildModuleGraph(project, paths);
		const entries = collectEntryModules(project, paths, graph);
		expect(entries.has("DocsModule")).toBe(false);
	});

	it("roots a module without the Module suffix when the helper is unresolvable", () => {
		const { project, paths } = createProject({
			"main.ts": `
				import { Module } from '@nestjs/common';
				import { standaloneBootstrap } from 'some-unscanned-pkg';
				@Module({})
				export class Root {}
				standaloneBootstrap(Root);
			`,
		});
		const graph = buildModuleGraph(project, paths);
		const entries = collectEntryModules(project, paths, graph);
		expect(entries.has("Root")).toBe(true);
	});

	it("roots a module handed to a bootstrap helper resolving to an ambient declaration", () => {
		const { project, paths } = createProject({
			"boot.d.ts":
				"export declare function standaloneBootstrap(mod: unknown): void;",
			"main.ts": `
				import { Module } from '@nestjs/common';
				import { standaloneBootstrap } from './boot';
				@Module({})
				export class Root {}
				standaloneBootstrap(Root);
			`,
		});
		const graph = buildModuleGraph(project, paths);
		const entries = collectEntryModules(project, paths, graph);
		expect(entries.has("Root")).toBe(true);
	});
});

describe("wrapper overloads and route paths", () => {
	it("recognizes a wrapper declared with overload signatures", () => {
		const { project } = createProject({
			"rest.ts": `
				import { applyDecorators, Get } from '@nestjs/common';
				export function MyRead(type: unknown): MethodDecorator;
				export function MyRead(type: unknown, path: string): MethodDecorator;
				export function MyRead(type: unknown, path?: string) {
					return applyDecorators(Get(path));
				}
			`,
			"c.ts": `
				import { MyRead } from './rest';
				export class C {
					@MyRead(Object)
					async read() { return 1; }
				}
			`,
		});
		const method = project
			.getSourceFileOrThrow("c.ts")
			.getClasses()[0]
			.getMethods()[0];
		expect(isHttpHandler(method)).toBe(true);
	});

	it("routes description strings and path strings to their wrapper parameters", () => {
		const { project, paths } = createProject({
			"rest.ts": REST_WRAPPERS,
			"health.controller.ts": `
				import { MyRestController, MyReadOneOk } from './rest';
				@MyRestController({ path: 'health' })
				export class HealthController {
					@MyReadOneOk(Object, 'Fetches one user')
					async readAll() { return []; }
					@MyReadOneOk(Object, 'Health')
					async status() { return { ok: true }; }
					@MyReadOneOk(Object, 'Fetches one', ':id')
					async readOne() { return {}; }
				}
			`,
		});
		const graph = buildEndpointGraph(project, paths, new Map());
		const byHandler = (name: string) =>
			graph.endpoints.find((e) => e.handlerMethod === name);
		expect(byHandler("readAll")?.routePath).toBe("/health");
		expect(byHandler("status")?.routePath).toBe("/health");
		expect(byHandler("readOne")?.routePath).toBe("/health/:id");
	});

	it("extracts the path from a wrapper branching over argless and parameterized calls", () => {
		const { project, paths } = createProject({
			"rest2.ts": `
				import { applyDecorators, Get } from '@nestjs/common';
				export function ApiGet(path?: string) {
					return path == null ? applyDecorators(Get()) : applyDecorators(Get(path));
				}
			`,
			"users.controller.ts": `
				import { Controller } from '@nestjs/common';
				import { ApiGet } from './rest2';
				@Controller('users')
				export class UsersController {
					@ApiGet(':id')
					async readOne() { return {}; }
				}
			`,
		});
		const graph = buildEndpointGraph(project, paths, new Map());
		const endpoint = graph.endpoints.find((e) => e.handlerMethod === "readOne");
		expect(endpoint?.routePath).toBe("/users/:id");
	});
});

describe("same-name scoping and package imports", () => {
	it("does not union same-name modules from different directories", () => {
		const { project, paths } = createProject({
			"feature-a/shared.module.ts": `
				import { Module } from '@nestjs/common';
				import { UsersModule } from '../users.module';
				@Module({ imports: [UsersModule] })
				export class SharedModule {}
			`,
			"feature-b/shared.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class SharedModule {}
			`,
			"users.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class UsersModule {}
			`,
		});
		const graph = buildModuleGraph(project, paths);
		const shared = graph.modules.get("SharedModule");
		expect(shared?.filePaths).toBeUndefined();
		expect(shared?.filePath).toBe("feature-b/shared.module.ts");
	});

	it("leaves a package-imported name unresolved instead of binding it cross-project", () => {
		const graphs = new Map<string, ModuleGraph>();
		{
			const { project, paths } = createProject({
				"app.module.ts": `
					import { Module } from '@nestjs/common';
					import { SharedModule } from 'some-npm-pkg';
					@Module({ imports: [SharedModule] })
					export class AppModule {}
				`,
			});
			graphs.set("api", buildModuleGraph(project, paths));
		}
		{
			const { project, paths } = createProject({
				"shared.module.ts": `
					import { Module } from '@nestjs/common';
					@Module({})
					export class SharedModule {}
				`,
			});
			graphs.set("legacy", buildModuleGraph(project, paths));
		}
		const merged = mergeModuleGraphs(graphs);
		const app = merged.modules.get("api/AppModule");
		expect(app?.imports).toContain("SharedModule");
		expect(app?.imports).not.toContain("legacy/SharedModule");
		expect(merged.edges.get("api/AppModule")?.has("legacy/SharedModule")).toBe(
			false
		);
	});

	it("binds a package-imported name whose specifier is a scanned workspace project", () => {
		const graphs = new Map<string, ModuleGraph>();
		{
			const { project, paths } = createProject({
				"app.module.ts": `
					import { Module } from '@nestjs/common';
					import { SharedModule } from '@myorg/shared';
					@Module({ imports: [SharedModule] })
					export class AppModule {}
				`,
			});
			graphs.set("api", buildModuleGraph(project, paths));
		}
		{
			const { project, paths } = createProject({
				"shared.module.ts": `
					import { Module } from '@nestjs/common';
					@Module({})
					export class SharedModule {}
				`,
			});
			graphs.set("@myorg/shared", buildModuleGraph(project, paths));
		}
		const merged = mergeModuleGraphs(graphs);
		expect(
			merged.edges.get("api/AppModule")?.has("@myorg/shared/SharedModule")
		).toBe(true);
	});

	it("binds a package-imported name whose specifier is a subpath of a scanned project", () => {
		const graphs = new Map<string, ModuleGraph>();
		{
			const { project, paths } = createProject({
				"app.module.ts": `
					import { Module } from '@nestjs/common';
					import { SharedTestingModule } from '@myorg/shared/testing';
					@Module({ imports: [SharedTestingModule] })
					export class AppModule {}
				`,
			});
			graphs.set("api", buildModuleGraph(project, paths));
		}
		{
			const { project, paths } = createProject({
				"testing.module.ts": `
					import { Module } from '@nestjs/common';
					@Module({})
					export class SharedTestingModule {}
				`,
			});
			graphs.set("@myorg/shared", buildModuleGraph(project, paths));
		}
		const merged = mergeModuleGraphs(graphs);
		expect(
			merged.edges
				.get("api/AppModule")
				?.has("@myorg/shared/SharedTestingModule")
		).toBe(true);
	});

	it("survives a schematics template file with a non-literal import specifier", () => {
		const { project, paths } = createProject({
			"__name__.middleware.__specFileSuffix__.ts":
				"import { <%= classify(name) %>Middleware } from './<%= name %>.middleware';\n",
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class AppModule {}
			`,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.has("AppModule")).toBe(true);
	});

	it("keeps the surviving winner when updating an evicted same-name declaration", () => {
		const { project, paths } = createProject({
			"feature-a/shared.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class SharedModule {}
			`,
			"feature-b/shared.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class SharedModule {}
			`,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("SharedModule")?.filePath).toBe(
			"feature-b/shared.module.ts"
		);
		updateModuleGraphForFile(graph, project, "feature-a/shared.module.ts");
		expect(graph.modules.get("SharedModule")?.filePath).toBe(
			"feature-b/shared.module.ts"
		);
	});
});
