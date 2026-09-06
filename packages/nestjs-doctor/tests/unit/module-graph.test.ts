import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	buildModuleGraph,
	buildModuleGraphAsync,
	detachModuleGraph,
	findCircularDeps,
	findProviderModule,
	mergeModuleGraphs,
	updateModuleGraphForFile,
} from "../../src/engine/graph/module-graph.js";
import type { PathAliasMap } from "../../src/engine/graph/tsconfig-paths.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

describe("module-graph", () => {
	it("builds the same graph batched as it does in one pass", async () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { UsersModule } from './users.module';
        @Module({ imports: [UsersModule] })
        export class AppModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});
		const sync = buildModuleGraph(project, paths);
		const batched = await buildModuleGraphAsync(project, paths);
		expect(batched.modules.size).toBe(sync.modules.size);
		expect([...batched.modules.keys()]).toEqual([...sync.modules.keys()]);
		expect(batched.edges.get("AppModule")).toEqual(sync.edges.get("AppModule"));
		expect(batched.providerToModule).toEqual(sync.providerToModule);
	});

	it("records the tokens of object-literal providers", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { APP_GUARD } from '@nestjs/core';
        @Module({
          providers: [
            AppService,
            { provide: APP_GUARD, useClass: JwtAuthGuard },
            { provide: 'TOKEN', useExisting: RealService },
          ],
        })
        export class AppModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AppModule")?.providerTokens).toEqual([
			"APP_GUARD",
			"'TOKEN'",
		]);
	});

	it("leaves providerTokens empty when there are no object literals", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [AppService] })
        export class AppModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AppModule")?.providerTokens).toEqual([]);
	});

	// @Module() decorator metadata should populate imports, exports, providers, and controllers
	it("builds a graph from @Module decorators", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [UsersModule],
          providers: [AppService],
          controllers: [AppController],
        })
        export class AppModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          providers: [UsersService],
          exports: [UsersService],
        })
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);

		expect(graph.modules.size).toBe(2);
		expect(graph.modules.has("AppModule")).toBe(true);
		expect(graph.modules.has("UsersModule")).toBe(true);

		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("UsersModule");
		expect(app.providers).toContain("AppService");
		expect(app.controllers).toContain("AppController");

		const users = graph.modules.get("UsersModule")!;
		expect(users.providers).toContain("UsersService");
		expect(users.exports).toContain("UsersService");
	});

	// Module import references should produce directed edges in the graph
	it("builds edges for module import relationships", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [UsersModule, OrdersModule] })
        export class AppModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
			"orders.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [UsersModule] })
        export class OrdersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(graph.edges.get("AppModule")?.has("UsersModule")).toBe(true);
		expect(graph.edges.get("AppModule")?.has("OrdersModule")).toBe(true);
		expect(graph.edges.get("OrdersModule")?.has("UsersModule")).toBe(true);
	});

	// Mutual imports between two modules should be detected as a cycle
	it("detects circular dependencies", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [BModule] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule] })
        export class BModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const cycles = findCircularDeps(graph);

		expect(cycles.length).toBeGreaterThan(0);
	});

	// A one-way import chain should produce zero cycles
	it("returns no cycles for acyclic graphs", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [UsersModule] })
        export class AppModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const cycles = findCircularDeps(graph);
		expect(cycles).toHaveLength(0);
	});

	// Two acyclic files whose same-name declarations union into a phantom cycle
	it("returns no cycles when neither declaration file contains one", () => {
		const { project, paths } = createProject({
			"/x/core.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [UsersModule] })
        export class CoreModule {}
        @Module({})
        export class UsersModule {}
      `,
			"/y/core.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CoreModule {}
        @Module({ imports: [CoreModule] })
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(findCircularDeps(graph)).toEqual([]);
	});

	// Same-name modules one per file: each import statement points at one of them
	it("returns no cycles when same-name modules are declared one per file", () => {
		const { project, paths } = createProject({
			"/x/core.module.ts": `
        import { Module } from '@nestjs/common';
        import { UsersModule } from './users.module';
        @Module({ imports: [UsersModule] })
        export class CoreModule {}
      `,
			"/x/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
			"/y/core.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CoreModule {}
      `,
			"/y/users.module.ts": `
        import { Module } from '@nestjs/common';
        import { CoreModule } from './core.module';
        @Module({ imports: [CoreModule] })
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(findCircularDeps(graph)).toEqual([]);
	});

	it("follows the import statement when two same-name modules collide", () => {
		const { project, paths } = createProject({
			"/feature-a/shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class SharedModule {}
      `,
			"/feature-b/shared.module.ts": `
        import { Module } from '@nestjs/common';
        import { UsersModule } from '../users.module';
        @Module({ imports: [UsersModule] })
        export class SharedModule {}
      `,
			"/users.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedModule } from './feature-a/shared.module';
        @Module({ imports: [SharedModule] })
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(findCircularDeps(graph)).toEqual([]);
	});

	it("reports the cycle when the import reaches the cyclic same-name module", () => {
		const { project, paths } = createProject({
			"/feature-a/shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class SharedModule {}
      `,
			"/feature-b/shared.module.ts": `
        import { Module } from '@nestjs/common';
        import { UsersModule } from '../users.module';
        @Module({ imports: [UsersModule] })
        export class SharedModule {}
      `,
			"/users.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedModule } from './feature-b/shared.module';
        @Module({ imports: [SharedModule] })
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const cycles = findCircularDeps(graph);

		expect(cycles).toHaveLength(1);
		expect([...cycles[0]].sort()).toEqual(["SharedModule", "UsersModule"]);
	});

	// A real cycle stays visible when one of its members shares a name elsewhere
	it("detects a cycle whose member is also declared in an unrelated file", () => {
		const { project, paths } = createProject({
			"feature-a/a.module.ts": `
        import { Module } from '@nestjs/common';
        import { BModule } from './b.module';
        @Module({ imports: [BModule] })
        export class AModule {}
      `,
			"feature-a/b.module.ts": `
        import { Module } from '@nestjs/common';
        import { AModule } from './a.module';
        @Module({ imports: [AModule] })
        export class BModule {}
      `,
			"feature-b/b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class BModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const cycles = findCircularDeps(graph);

		expect(cycles).toHaveLength(1);
		expect([...cycles[0]].sort()).toEqual(["AModule", "BModule"]);
	});

	// Both declarations reaching the same module must not report the cycle twice
	it("reports one cycle when two declarations of a member import it", () => {
		const { project, paths } = createProject({
			"feature-a/a.module.ts": `
        import { Module } from '@nestjs/common';
        import { BModule } from './b.module';
        @Module({ imports: [BModule] })
        export class AModule {}
      `,
			"feature-b/a.module.ts": `
        import { Module } from '@nestjs/common';
        import { BModule } from '../feature-a/b.module';
        @Module({ imports: [BModule] })
        export class AModule {}
      `,
			"feature-a/b.module.ts": `
        import { Module } from '@nestjs/common';
        import { AModule } from './a.module';
        @Module({ imports: [AModule] })
        export class BModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(findCircularDeps(graph)).toHaveLength(1);
	});

	// Prefixing sub-project names must reach the per-declaration imports too
	it("keeps per-declaration cycles after a monorepo merge", () => {
		const { project: api, paths: apiPaths } = createProject({
			"apps/api/a.module.ts": `
        import { Module } from '@nestjs/common';
        import { BModule } from './b.module';
        @Module({ imports: [BModule] })
        export class AModule {}
      `,
			"apps/api/b.module.ts": `
        import { Module } from '@nestjs/common';
        import { AModule } from './a.module';
        @Module({ imports: [AModule] })
        export class BModule {}
      `,
			"apps/api/legacy/b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class BModule {}
      `,
		});
		const { project: admin, paths: adminPaths } = createProject({
			"apps/admin/x/core.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [UsersModule] })
        export class CoreModule {}
        @Module({})
        export class UsersModule {}
      `,
			"apps/admin/y/core.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CoreModule {}
        @Module({ imports: [CoreModule] })
        export class UsersModule {}
      `,
		});

		const merged = mergeModuleGraphs(
			new Map([
				["api", buildModuleGraph(api, apiPaths)],
				["admin", buildModuleGraph(admin, adminPaths)],
			])
		);
		const cycles = findCircularDeps(merged);

		expect(cycles).toHaveLength(1);
		expect([...cycles[0]].sort()).toEqual(["api/AModule", "api/BModule"]);
	});

	// A provider registered in a module should be discoverable via the inverse index
	it("finds provider module", () => {
		const { project, paths } = createProject({
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [UsersService] })
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const mod = findProviderModule(graph, "UsersService");
		expect(mod?.name).toBe("UsersModule");
	});

	// Merging two graphs should prefix module names with project names to avoid collisions
	it("merges graphs with prefixed module names", () => {
		const { project: p1, paths: paths1 } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [UsersModule], providers: [AppService] })
        export class AppModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [UsersService], exports: [UsersService] })
        export class UsersModule {}
      `,
		});

		const { project: p2, paths: paths2 } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [AdminService] })
        export class AppModule {}
      `,
		});

		const graph1 = buildModuleGraph(p1, paths1);
		const graph2 = buildModuleGraph(p2, paths2);

		const graphs = new Map([
			["api", graph1],
			["admin", graph2],
		]);
		const merged = mergeModuleGraphs(graphs);

		// Modules are prefixed
		expect(merged.modules.size).toBe(3);
		expect(merged.modules.has("api/AppModule")).toBe(true);
		expect(merged.modules.has("api/UsersModule")).toBe(true);
		expect(merged.modules.has("admin/AppModule")).toBe(true);

		// Imports are remapped
		const apiApp = merged.modules.get("api/AppModule")!;
		expect(apiApp.imports).toContain("api/UsersModule");

		// Exports keep non-module names unprefixed (UsersService is a provider, not a module)
		const apiUsers = merged.modules.get("api/UsersModule")!;
		expect(apiUsers.exports).toContain("UsersService");

		// Edges are prefixed
		expect(merged.edges.get("api/AppModule")?.has("api/UsersModule")).toBe(
			true
		);

		// providerToModule references the same object as modules map
		const providerModule = merged.providerToModule.get("api/AppService");
		expect(providerModule).toBe(merged.modules.get("api/AppModule"));
	});

	// forwardRef(() => SomeModule) should unwrap the arrow function and resolve to the module name
	it("handles forwardRef in imports", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module, forwardRef } from '@nestjs/common';
        @Module({ imports: [forwardRef(() => BModule)] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class BModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const aModule = graph.modules.get("AModule");
		expect(aModule?.imports).toContain("BModule");
	});

	it("populates forwardRefImports for forwardRef-wrapped module imports", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { forwardRef, Module } from '@nestjs/common';
        @Module({ imports: [forwardRef(() => BModule)] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule] })
        export class BModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const a = graph.modules.get("AModule");
		const b = graph.modules.get("BModule");
		expect(a?.imports).toContain("BModule");
		expect(a?.forwardRefImports).toEqual(new Set(["BModule"]));
		expect(b?.imports).toContain("AModule");
		expect(b?.forwardRefImports).toEqual(new Set());
	});

	it("preserves forwardRefImports across mergeModuleGraphs with project prefixing", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { forwardRef, Module } from '@nestjs/common';
        @Module({ imports: [forwardRef(() => BModule)] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { forwardRef, Module } from '@nestjs/common';
        @Module({ imports: [forwardRef(() => AModule)] })
        export class BModule {}
      `,
		});
		const inner = buildModuleGraph(project, paths);
		const merged = mergeModuleGraphs(new Map([["api", inner]]));
		const a = merged.modules.get("api/AModule");
		expect(a?.forwardRefImports).toEqual(new Set(["api/BModule"]));
	});

	it("does not treat look-alike identifiers (forwardRefHelper) as forwardRef calls", () => {
		const { project, paths } = createProject({
			"helper.ts": `
        export function forwardRefHelper(m: unknown) { return m; }
        export class BModule {}
      `,
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        import { forwardRefHelper, BModule } from './helper';
        @Module({ imports: [forwardRefHelper(BModule)] })
        export class AModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const a = graph.modules.get("AModule");
		expect(a?.forwardRefImports).toEqual(new Set());
	});

	// Dynamic module methods like .forRoot() should resolve to the module class name
	it("resolves Module.forRoot() dynamic module imports", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [ConfigModule.forRoot({ isGlobal: true })],
        })
        export class AppModule {}
      `,
			"config.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class ConfigModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("ConfigModule");
		expect(graph.edges.get("AppModule")?.has("ConfigModule")).toBe(true);
	});

	// .forFeature() should resolve identically to .forRoot() — extract the module class name
	it("resolves Module.forFeature() dynamic module imports", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [TypeOrmModule.forFeature([UserEntity])],
        })
        export class AppModule {}
      `,
			"typeorm.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class TypeOrmModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("TypeOrmModule");
	});

	// .concat() on an array literal should collect elements from both sides
	it("resolves .concat() chains", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [AuthModule].concat([UsersModule]),
        })
        export class AppModule {}
      `,
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// A same-file helper function returning an array of modules should be inlined into imports
	it("resolves same-file function call in imports", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';

        function getImports() {
          return [AuthModule];
        }

        @Module({
          imports: getImports(),
        })
        export class AppModule {}
      `,
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
	});

	// A same-file const variable holding an array of modules should resolve its elements
	it("resolves same-file variable reference in imports", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';

        const commonImports = [AuthModule, UsersModule];

        @Module({
          imports: commonImports,
        })
        export class AppModule {}
      `,
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Chaining .concat() on a function call should collect modules from both the function and the argument
	it("resolves function call with .concat()", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';

        function getBaseImports() {
          return [AuthModule];
        }

        @Module({
          imports: getBaseImports().concat([UsersModule]),
        })
        export class AppModule {}
      `,
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// An imports array mixing plain identifiers, .forRoot(), and forwardRef should resolve all three
	it("resolves mixed elements: plain, dynamic module, and forwardRef", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module, forwardRef } from '@nestjs/common';
        @Module({
          imports: [
            UsersModule,
            ConfigModule.forRoot(),
            forwardRef(() => OrdersModule),
          ],
        })
        export class AppModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
			"config.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class ConfigModule {}
      `,
			"orders.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class OrdersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("UsersModule");
		expect(app.imports).toContain("ConfigModule");
		expect(app.imports).toContain("OrdersModule");
	});

	// Spread of a function call (...getImports()) should inline the returned array elements
	it("resolves spread of function call in imports", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';

        function getCommonImports() {
          return [AuthModule];
        }

        @Module({
          imports: [...getCommonImports(), UsersModule],
        })
        export class AppModule {}
      `,
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	it("follows both branches of a conditional imports value", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: someCondition ? [AuthModule] : [UsersModule],
        })
        export class AppModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toEqual(["AuthModule", "UsersModule"]);
	});

	// Cross-file: a function imported from another file should be resolved
	it("resolves cross-file function call", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from './helpers';
        @Module({ imports: getImports() })
        export class AppModule {}
      `,
			"/src/helpers.ts": `
        export function getImports() {
          return [AuthModule, UsersModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Cross-file: a variable imported from another file should be resolved
	it("resolves cross-file variable reference", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { commonImports } from './shared';
        @Module({ imports: commonImports })
        export class AppModule {}
      `,
			"/src/shared.ts": `
        export const commonImports = [AuthModule, UsersModule];
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Cross-file: function().concat([X]) pattern from the issue
	it("resolves cross-file .concat() chain", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getServiceImports } from './shared';
        @Module({ imports: getServiceImports().concat([AdminModule]) })
        export class AppModule {}
      `,
			"/src/shared.ts": `
        export function getServiceImports() {
          return [AuthModule, DatabaseModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/database.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class DatabaseModule {}
      `,
			"/src/admin.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AdminModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("DatabaseModule");
		expect(app.imports).toContain("AdminModule");
	});

	// Cross-file: chained resolution across 3 files (A calls B, B calls C)
	it("resolves chained cross-file function calls", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getServiceImports } from './service-imports';
        @Module({ imports: getServiceImports().concat([AdminModule]) })
        export class AppModule {}
      `,
			"/src/service-imports.ts": `
        import { getBaseImports } from './base-imports';
        export function getServiceImports() {
          return getBaseImports().concat([DatabaseModule]);
        }
      `,
			"/src/base-imports.ts": `
        export function getBaseImports() {
          return [AuthModule, HealthModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/health.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class HealthModule {}
      `,
			"/src/database.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class DatabaseModule {}
      `,
			"/src/admin.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AdminModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("HealthModule");
		expect(app.imports).toContain("DatabaseModule");
		expect(app.imports).toContain("AdminModule");
	});

	// Cross-file: arrow function export should be resolved
	it("resolves cross-file arrow function export", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from './helpers';
        @Module({ imports: getImports() })
        export class AppModule {}
      `,
			"/src/helpers.ts": `
        export const getImports = () => [AuthModule, UsersModule];
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Non-relative import without path aliases should be silently ignored, not crash
	it("ignores non-relative imports gracefully", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from '@shared/helpers';
        @Module({ imports: getImports() })
        export class AppModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toEqual([]);
	});

	// Path alias: cross-file function call via @app/* alias
	it("resolves path alias imports for cross-file function calls", () => {
		const aliases: PathAliasMap = new Map([["@app/*", ["/src/*"]]]);
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from '@app/helpers';
        @Module({ imports: getImports() })
        export class AppModule {}
      `,
			"/src/helpers.ts": `
        export function getImports() {
          return [AuthModule, UsersModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths, aliases);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Path alias: cross-file variable reference via alias
	it("resolves path alias imports for cross-file variable references", () => {
		const aliases: PathAliasMap = new Map([["@libs/*", ["/src/libs/*"]]]);
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { commonImports } from '@libs/shared';
        @Module({ imports: commonImports })
        export class AppModule {}
      `,
			"/src/libs/shared.ts": `
        export const commonImports = [AuthModule, UsersModule];
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths, aliases);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Path alias: index.ts barrel file resolution
	it("resolves path alias to index.ts barrel file", () => {
		const aliases: PathAliasMap = new Map([["@app/*", ["/src/*"]]]);
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from '@app/shared';
        @Module({ imports: getImports() })
        export class AppModule {}
      `,
			"/src/shared/index.ts": `
        export { getImports } from './helpers';
      `,
			"/src/shared/helpers.ts": `
        export function getImports() {
          return [AuthModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths, aliases);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
	});

	// Spread of a cross-file function call should resolve
	it("resolves spread of cross-file function call", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from './helpers';
        @Module({ imports: [...getImports(), LocalModule] })
        export class AppModule {}
      `,
			"/src/helpers.ts": `
        export function getImports() {
          return [AuthModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("LocalModule");
	});

	// Import alias: import { foo as bar } should resolve to the original name
	it("resolves import alias correctly", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports as getAppImports } from './helpers';
        @Module({ imports: getAppImports() })
        export class AppModule {}
      `,
			"/src/helpers.ts": `
        export function getImports() {
          return [AuthModule, UsersModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Barrel file re-export: export { X } from './other' should resolve through
	// Import resolution must not consult the host platform: ts-morph reports
	// posix paths everywhere, so a Windows drive root, a posix root, and
	// ts-morph's in-memory root all have to resolve by the same rules. These run
	// identically on every platform, which is the point — the Windows-only
	// breakage they cover was invisible until CI grew a Windows job.
	it("resolves relative imports under a Windows drive root", () => {
		const { project, paths } = createProject({
			"D:/proj/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { AuthModule } from './auth.module';
        @Module({ imports: [AuthModule] })
        export class AppModule {}
      `,
			"D:/proj/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AppModule")?.imports).toContain("AuthModule");
	});

	it("resolves parent-directory imports without escaping the root", () => {
		const { project, paths } = createProject({
			"/proj/src/features/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { AuthModule } from '../shared/auth.module';
        @Module({ imports: [AuthModule] })
        export class AppModule {}
      `,
			"/proj/src/shared/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AppModule")?.imports).toContain("AuthModule");
	});

	it("resolves barrel file re-exports", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from './barrel';
        @Module({ imports: getImports() })
        export class AppModule {}
      `,
			"/src/barrel.ts": `
        export { getImports } from './helpers';
      `,
			"/src/helpers.ts": `
        export function getImports() {
          return [AuthModule, UsersModule];
        }
      `,
			"/src/auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"/src/users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Unresolvable file should not crash
	it("handles unresolvable cross-file import gracefully", () => {
		const { project, paths } = createProject({
			"/src/app.module.ts": `
        import { Module } from '@nestjs/common';
        import { getImports } from './nonexistent';
        @Module({ imports: getImports() })
        export class AppModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toEqual([]);
	});

	// .forRootAsync() with nested config object should resolve to the module class name
	it("resolves Module.forRootAsync() dynamic module imports", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [DatabaseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({})
          })],
        })
        export class AppModule {}
      `,
			"database.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class DatabaseModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("DatabaseModule");
		expect(graph.edges.get("AppModule")?.has("DatabaseModule")).toBe(true);
	});

	// Same-file arrow function should also work
	it("resolves same-file arrow function in imports", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';

        const getImports = () => [AuthModule, UsersModule];

        @Module({
          imports: getImports(),
        })
        export class AppModule {}
      `,
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	it("records the method a dynamic import was registered with", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [AuthModule.forRoot(), EventsModule.registerAsync(), UsersModule],
        })
        export class AppModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AppModule")?.dynamicImports).toEqual({
			AuthModule: "forRoot",
			EventsModule: "registerAsync",
		});
	});

	it("prefers the dynamic method when a module is also imported plainly", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AuthModule, AuthModule.forRoot()] })
        export class AppModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AppModule")?.dynamicImports).toEqual({
			AuthModule: "forRoot",
		});
	});

	it("marks modules decorated with @Global", () => {
		const { project, paths } = createProject({
			"datadog.module.ts": `
        import { Global, Module } from '@nestjs/common';
        @Global()
        @Module({})
        export class DatadogModule {}
      `,
			"users.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class UsersModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("DatadogModule")?.isGlobal).toBe(true);
		expect(graph.modules.get("UsersModule")?.isGlobal).toBe(false);
		// The start line is the first decorator, matching what rules report.
		expect(graph.modules.get("DatadogModule")?.line).toBe(3);
	});

	it("resolves a cross-project import when one sub-project matches", () => {
		const { project: app, paths: appPaths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AppointmentsModule, AuthModule.forRoot(), ConfigModule] })
        export class AppModule {}
      `,
		});
		const { project: lib, paths: libPaths } = createProject({
			"appointments.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [AppointmentsService], exports: [AppointmentsService] })
        export class AppointmentsModule {}
      `,
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AuthModule {}
      `,
		});

		const merged = mergeModuleGraphs(
			new Map([
				["apps/api", buildModuleGraph(app, appPaths)],
				["libs/core", buildModuleGraph(lib, libPaths)],
			])
		);

		const apiApp = merged.modules.get("apps/api/AppModule")!;
		expect(apiApp.project).toBe("apps/api");
		expect(apiApp.imports).toContain("libs/core/AppointmentsModule");
		expect(apiApp.imports).toContain("libs/core/AuthModule");
		// Not a module anywhere in the workspace, so it stays as written.
		expect(apiApp.imports).toContain("ConfigModule");
		expect(apiApp.dynamicImports).toEqual({
			"libs/core/AuthModule": "forRoot",
		});

		const targets = merged.edges.get("apps/api/AppModule")!;
		expect(targets.has("libs/core/AppointmentsModule")).toBe(true);
		expect(targets.has("libs/core/AuthModule")).toBe(true);
		expect(targets.has("ConfigModule")).toBe(false);
	});

	it("leaves an ambiguous cross-project import unresolved", () => {
		const { project: app, paths: appPaths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [SharedModule] })
        export class AppModule {}
      `,
		});
		const shared = (source: string) =>
			createProject({
				"shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: ['${source}'] })
        export class SharedModule {}
      `,
			});
		const { project: one, paths: onePaths } = shared("one");
		const { project: two, paths: twoPaths } = shared("two");

		const merged = mergeModuleGraphs(
			new Map([
				["apps/api", buildModuleGraph(app, appPaths)],
				["libs/one", buildModuleGraph(one, onePaths)],
				["libs/two", buildModuleGraph(two, twoPaths)],
			])
		);

		const apiApp = merged.modules.get("apps/api/AppModule")!;
		expect(apiApp.imports).toEqual(["SharedModule"]);
		expect(merged.edges.get("apps/api/AppModule")?.size).toBe(0);
	});
});

describe("dynamic module metadata", () => {
	const cacheService = `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class CacheService {}
      `;
	const appImportingForRoot = `
        import { Module } from '@nestjs/common';
        import { CacheModule } from './cache.module';
        @Module({ imports: [CacheModule.forRoot()] })
        export class AppModule {}
      `;
	const forRootRepro = {
		"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        import { CacheService } from './cache.service';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { module: CacheModule, providers: [CacheService], exports: [CacheService] };
          }
        }
      `,
		"cache.service.ts": cacheService,
		"app.module.ts": appImportingForRoot,
	};
	const allProviders = (graph: ReturnType<typeof buildModuleGraph>) =>
		[...graph.modules.values()].flatMap((m) => m.providers);

	it("registers a class listed only in a forRoot literal", () => {
		const { project, paths } = createProject(forRootRepro);
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("exports a class listed only in a forRoot literal", () => {
		const { project, paths } = createProject(forRootRepro);
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.exports).toContain("CacheService");
	});

	it("maps a forRoot-only provider to its module", () => {
		const { project, paths } = createProject(forRootRepro);
		const graph = buildModuleGraph(project, paths);
		expect(graph.providerToModule.get("CacheService")?.name).toBe(
			"CacheModule"
		);
	});

	it("reads a static method with a name outside the forRoot family", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static withConfig(): DynamicModule {
            return { module: CacheModule, providers: [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("resolves module: this to the enclosing class", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { module: this, providers: [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("follows a local const returned by shorthand", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            const providers = [CacheService];
            return { module: CacheModule, providers, exports: providers };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
		expect(graph.modules.get("CacheModule")?.exports).toContain("CacheService");
	});

	it("collects push calls on a local providers array", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule, Provider } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(opts: { metrics?: boolean }): DynamicModule {
            const providers: Provider[] = [CacheService];
            if (opts.metrics) providers.push(MetricsService);
            return { module: CacheModule, providers };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CacheModule")?.providers;
		expect(providers).toContain("CacheService");
		expect(providers).toContain("MetricsService");
	});

	it("follows a spread of a file-level const", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule, Provider } from '@nestjs/common';
        const baseProviders: Provider[] = [CacheService];
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { module: CacheModule, providers: [...baseProviders, StatsService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CacheModule")?.providers;
		expect(providers).toContain("CacheService");
		expect(providers).toContain("StatsService");
	});

	it("follows a spread of a private static helper with two return statements", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule, Provider } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRootAsync(o: { useFactory?: () => unknown }): DynamicModule {
            return { module: CacheModule, providers: [CacheService, ...this.createAsyncProviders(o)] };
          }
          private static createAsyncProviders(o: { useFactory?: () => unknown }): Provider[] {
            if (o.useFactory) return [FactoryOptions];
            return [ClassOptions, { provide: 'OPTS', useClass: OptionsFactory }];
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CacheModule")?.providers;
		expect(providers).toContain("CacheService");
		expect(providers).toContain("FactoryOptions");
		expect(providers).toContain("ClassOptions");
	});

	it("follows a static helper called through the class name", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule, Provider } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { module: CacheModule, providers: CacheModule.createProviders() };
          }
          private static createProviders(): Provider[] {
            return [CacheService];
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("follows both branches of a conditional providers value", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(o: { noop?: boolean }): DynamicModule {
            return { module: CacheModule, providers: o.noop ? [NoopCacheService] : [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CacheModule")?.providers;
		expect(providers).toContain("NoopCacheService");
		expect(providers).toContain("CacheService");
	});

	it("follows both sides of a nullish coalescing providers value", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule, Provider } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(o: { providers?: Provider[] }): DynamicModule {
            return { module: CacheModule, providers: o.providers ?? [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("resolves providers through a filter call on a local array", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            const base = [CacheService, StatsService];
            return { module: CacheModule, providers: base.filter(Boolean) };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CacheModule")?.providers;
		expect(providers).toContain("CacheService");
		expect(providers).toContain("StatsService");
	});

	it("unwraps a satisfies DynamicModule literal", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { module: CacheModule, providers: [CacheService] } satisfies DynamicModule;
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("unwraps an as DynamicModule literal with no return annotation", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot() {
            return { module: CacheModule, providers: [CacheService] } as DynamicModule;
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("reads an async static method returning Promise<DynamicModule>", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static async forRoot(): Promise<DynamicModule> {
            const cfg = await Promise.resolve({});
            return { module: CacheModule, providers: [CacheService, { provide: 'CFG', useValue: cfg }] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("reads the implementation body of an overloaded static method", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(config: object): DynamicModule;
          static forRoot(key: string, config: object): DynamicModule;
          static forRoot(keyOrConfig: string | object, config?: object): DynamicModule {
            return { module: CacheModule, providers: [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("resolves the owner of a generic module class by name", () => {
		const { project, paths } = createProject({
			"graphql.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class GraphQLModule<TDriver extends object = object> {
          static forRoot<TOptions extends Record<string, unknown>>(options?: TOptions): DynamicModule {
            return { module: GraphQLModule, providers: [GraphQLFactory] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("GraphQLModule")?.providers).toContain(
			"GraphQLFactory"
		);
	});

	it("attaches a standalone function in another file to the named module", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
      `,
			"make-cache-module.ts": `
        import { type DynamicModule } from '@nestjs/common';
        import { CacheModule } from './cache.module.js';
        import { CacheService } from './cache.service.js';
        export function makeCacheModule(): DynamicModule {
          return { module: CacheModule, providers: [CacheService], exports: [CacheService] };
        }
      `,
			"cache.service.ts": cacheService,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { makeCacheModule } from './make-cache-module.js';
        @Module({ imports: [makeCacheModule()] })
        export class AppModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
		expect(graph.modules.get("AppModule")?.providers).not.toContain(
			"CacheService"
		);
	});

	it("ignores a module literal in a test file", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
      `,
			"cache.module.spec.ts": `
        import { Test } from '@nestjs/testing';
        import { CacheModule } from './cache.module.js';
        import { StubService } from './stub.service.js';
        Test.createTestingModule({ imports: [CacheModule] })
          .overrideModule(CacheModule)
          .useModule({ module: CacheModule, providers: [StubService] });
      `,
			"stub.service.ts": "export class StubService {}",
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toEqual([]);
	});

	it("adds an edge from the importer to the module a returned literal names", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
      `,
			"make-cache-module.ts": `
        import { type DynamicModule } from '@nestjs/common';
        import { CacheModule } from './cache.module.js';
        export function makeCacheModule(): DynamicModule {
          return { module: CacheModule, providers: [] };
        }
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { CacheModule } from './cache.module.js';
        import { makeCacheModule } from './make-cache-module.js';
        @Module({ imports: [makeCacheModule(), { module: CacheModule, providers: [] }] })
        export class AppModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AppModule")?.imports).toEqual([
			"CacheModule",
			"CacheModule",
		]);
		expect([...(graph.edges.get("AppModule") ?? [])]).toEqual(["CacheModule"]);
	});

	it("attaches an arrow const returning a DynamicModule to the named module", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
        export const cacheModule = (): DynamicModule => ({
          module: CacheModule,
          providers: [CacheService],
        });
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("attaches a literal built by an undecorated factory class to the named module", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
        export class CacheModuleFactory {
          static build(): DynamicModule {
            return { module: CacheModule, providers: [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
		expect(graph.modules.has("CacheModuleFactory")).toBe(false);
	});

	it("attaches an inline literal in another module's imports to the named module", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { CacheModule } from './cache.module';
        import { CacheService } from './cache.service';
        @Module({ imports: [{ module: CacheModule, providers: [CacheService] }] })
        export class AppModule {}
      `,
			"cache.service.ts": cacheService,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
		expect(graph.modules.get("AppModule")?.providers).not.toContain(
			"CacheService"
		);
	});

	it("reads a static property holding a dynamic module literal", () => {
		const { project, paths } = createProject({
			"bull.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class BullModule {
          static readonly definition = { module: BullModule, providers: [BullExplorer], exports: [BullRegistrar] };
          static registerQueue(): DynamicModule {
            return { module: BullModule, imports: [BullModule.definition] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("BullModule")?.providers).toContain(
			"BullExplorer"
		);
		expect(graph.modules.get("BullModule")?.exports).toContain("BullRegistrar");
	});

	it("reads a literal assigned to a DynamicModule-typed const", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            const def: DynamicModule = { module: CacheModule, providers: [CacheService] };
            return def;
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
	});

	it("marks the module global when the literal says global: true", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { global: true, module: CacheModule, providers: [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.isGlobal).toBe(true);
	});

	it("reads controllers from a dynamic literal", () => {
		const { project, paths } = createProject({
			"health.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class HealthModule {
          static forRoot(): DynamicModule {
            return { module: HealthModule, controllers: [HealthController] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("HealthModule")?.controllers).toContain(
			"HealthController"
		);
	});

	it("reads @Module(meta) from a top-level const", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { ModuleMetadata } from '@nestjs/common';
        const meta: ModuleMetadata = { providers: [CacheService], exports: [CacheService] };
        @Module(meta)
        export class CacheModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
		expect(graph.modules.get("CacheModule")?.exports).toContain("CacheService");
	});

	it("attaches a setExtras transform to every module extending the built class", () => {
		const { project, paths } = createProject({
			"http.module-definition.ts": `
        import { ConfigurableModuleBuilder } from '@nestjs/common';
        import { MetricsService } from './metrics.service';
        export interface HttpOptions { baseUrl: string }
        export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
          new ConfigurableModuleBuilder<HttpOptions>()
            .setExtras({ isGlobal: false }, (def, extras) => ({
              ...def,
              global: extras.isGlobal,
              providers: [...(def.providers ?? []), MetricsService],
            }))
            .build();
      `,
			"http.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigurableModuleClass } from './http.module-definition';
        @Module({})
        export class HttpModule extends ConfigurableModuleClass {}
      `,
			"metrics.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class MetricsService {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("HttpModule")?.providers).toContain(
			"MetricsService"
		);
	});

	it("attaches a setExtras transform through an aliased binding", () => {
		const { project, paths } = createProject({
			"http.module-definition.ts": `
        import { ConfigurableModuleBuilder } from '@nestjs/common';
        export const { ConfigurableModuleClass: HttpBase } =
          new ConfigurableModuleBuilder<{ baseUrl: string }>()
            .setExtras({}, (def) => ({ ...def, providers: [...(def.providers ?? []), MetricsService] }))
            .build();
      `,
			"http.module.ts": `
        import { Module } from '@nestjs/common';
        import { HttpBase } from './http.module-definition';
        @Module({})
        export class HttpModule extends HttpBase {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("HttpModule")?.providers).toContain(
			"MetricsService"
		);
	});

	it("attaches a super-spreading register literal to the enclosing module", () => {
		const { project, paths } = createProject({
			"cache.module-definition.ts": `
        import { ConfigurableModuleBuilder } from '@nestjs/common';
        export const { ConfigurableModuleClass, OPTIONS_TYPE } =
          new ConfigurableModuleBuilder<{ isGlobal?: boolean }>().build();
      `,
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        import { ConfigurableModuleClass, OPTIONS_TYPE } from './cache.module-definition';
        @Module({})
        export class CacheModule extends ConfigurableModuleClass {
          static register(o: typeof OPTIONS_TYPE): DynamicModule {
            return { global: o.isGlobal, ...super.register(o), providers: [CacheService, AuditService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CacheModule")?.providers;
		expect(providers).toContain("CacheService");
		expect(providers).toContain("AuditService");
	});

	it("records provide tokens of object-literal providers in a forRoot literal", () => {
		const { project, paths } = createProject({
			"auth.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        import { APP_GUARD } from '@nestjs/core';
        @Module({})
        export class AuthModule {
          static forRoot(): DynamicModule {
            return { module: AuthModule, providers: [{ provide: APP_GUARD, useClass: AuthGuard }] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AuthModule")?.providerTokens).toContain(
			"APP_GUARD"
		);
	});

	it("lists a class declared in both the decorator and forRoot once", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({ providers: [CacheService], exports: [CacheService] })
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { module: CacheModule, providers: [CacheService, MetricsService], exports: [CacheService] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const node = graph.modules.get("CacheModule");
		expect(node?.providers.filter((p) => p === "CacheService")).toHaveLength(1);
		expect(node?.providers).toContain("MetricsService");
		expect(node?.exports.filter((p) => p === "CacheService")).toHaveLength(1);
	});

	it("does not add an edge for imports inside a dynamic literal", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        import { ConfigModule } from './config.module';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return { module: CacheModule, imports: [ConfigModule], providers: [CacheService] };
          }
        }
      `,
			"config.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class ConfigModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
		expect(graph.edges.get("CacheModule")?.has("ConfigModule")).toBe(false);
	});

	it("ignores a webpack-style literal whose module value is an object", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"webpack.config.ts": `
        export default {
          module: { rules: [{ test: /\\.ts$/, loader: TsLoader }] },
          resolve: { extensions: ['.ts', '.js'] },
        };
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect([...graph.modules.keys()]).toEqual(["AppModule"]);
		expect(allProviders(graph)).toEqual([]);
	});

	it("ignores a constructor argument whose module value is not a class", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"wasm.ts": `
        import { Module as WasmModule } from 'wasm-runtime';
        import { WasmHelper } from './wasm-helper';
        const bytes = new Uint8Array();
        export const wasm = new WasmModule({ module: bytes, providers: [WasmHelper] });
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(allProviders(graph)).not.toContain("WasmHelper");
	});

	it("ignores a literal whose module value is not a known module", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"plugin.ts": `
        import { PluginService } from './plugin.service';
        export const plugin = { module: SomeUnknownThing, providers: [PluginService] };
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect([...graph.modules.keys()]).toEqual(["AppModule"]);
		expect(allProviders(graph)).not.toContain("PluginService");
	});

	it("ignores a plain-object registry with a providers key", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"gateway.registry.ts": `
        import { StripeGateway } from './stripe.gateway';
        export const gatewayRegistry = {
          providers: [StripeGateway],
          pick: (name: string) => gatewayRegistry.providers.find((g) => g.name === name),
        };
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(allProviders(graph)).not.toContain("StripeGateway");
	});

	it("ignores an OAuth-style options object with a providers key", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"auth.options.ts": `
        import { GoogleStrategy } from './google.strategy';
        export const authOptions = {
          providers: [GoogleStrategy],
          session: { strategy: 'jwt' },
        };
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(allProviders(graph)).not.toContain("GoogleStrategy");
	});

	it("ignores an Angular-style app config with provide entries", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"app.config.ts": `
        import { HttpClient } from './http.client';
        export const appConfig = {
          providers: [provideRouter(routes), { provide: LOCALE_ID, useValue: 'en' }, HttpClient],
        };
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(allProviders(graph)).not.toContain("HttpClient");
	});

	it("ignores Test.createTestingModule in a non-spec helper", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"test/utils.ts": `
        import { Test } from '@nestjs/testing';
        import { AppModule } from '../app.module';
        import { Stub } from './stub';
        export function createApp() {
          return Test.createTestingModule({ imports: [AppModule], providers: [Stub] }).compile();
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(allProviders(graph)).not.toContain("Stub");
	});

	it("ignores a CommonJS module.exports object with a providers key", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"legacy.config.ts": `
        import { LegacyPlugin } from './legacy.plugin';
        module.exports = { providers: [LegacyPlugin], plugins: [] };
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(allProviders(graph)).not.toContain("LegacyPlugin");
	});

	it("ignores domain data and DTO fields named providers", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"clinic.ts": `
        import { HealthcareProvider } from './healthcare-provider';
        export const seedOrganisations = [
          { id: 1, name: 'Acme', providers: [{ id: 'p1', name: 'Dr Smith' }] },
        ];
        export class UpdateClinicDto { providers: HealthcareProvider[] = []; }
        export const byRegion: Record<string, { providers: HealthcareProvider[] }> = {};
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect([...graph.modules.keys()]).toEqual(["AppModule"]);
		expect(allProviders(graph)).not.toContain("HealthcareProvider");
	});

	it("does not register a class nested in a useValue object inside a forRoot literal", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CacheModule {
          static forRoot(): DynamicModule {
            return {
              module: CacheModule,
              providers: [CacheService, { provide: 'OPTS', useValue: { providers: [Foo] } }],
            };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CacheModule")?.providers;
		expect(providers).toContain("CacheService");
		expect(providers).not.toContain("Foo");
	});

	it("adds nothing from a setExtras transform that only sets global", () => {
		const { project, paths } = createProject({
			"http.module-definition.ts": `
        import { ConfigurableModuleBuilder } from '@nestjs/common';
        export const { ConfigurableModuleClass } =
          new ConfigurableModuleBuilder<{ isGlobal?: boolean }>()
            .setExtras({ isGlobal: false }, (def, extras) => ({ ...def, global: extras.isGlobal }))
            .build();
      `,
			"http.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigurableModuleClass } from './http.module-definition';
        @Module({ providers: [HttpService] })
        export class HttpModule extends ConfigurableModuleClass {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("HttpModule")?.providers).toEqual(["HttpService"]);
	});

	it("registers a call-site useClass only for an Async method", () => {
		const { project, paths } = createProject({
			"cfg.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CfgModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { CfgModule } from './cfg.module';
        @Module({
          imports: [
            CfgModule.forRootAsync({ useClass: CfgFactory }),
            CfgModule.describe({ useClass: PlainThing }),
            CfgModule.forFeature({ useClass: PlainThing, extraProviders: [Extra] }),
          ],
        })
        export class AppModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("CfgModule")?.providers;
		expect(providers).toContain("CfgFactory");
		expect(providers).not.toContain("PlainThing");
		expect(providers).not.toContain("Extra");
	});

	it("ignores a typed-position literal that is not returned", () => {
		const { project, paths } = createProject({
			"leak.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class OtherModule {}
        @Module({})
        export class LeakModule {
          static forRoot(): DynamicModule {
            const notMetadata = { providers: [Leaked], exports: [Leaked] };
            return { module: OtherModule, providers: [] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("LeakModule")?.providers).toEqual([]);
		expect(graph.modules.get("LeakModule")?.exports).toEqual([]);
	});

	it("follows a returned local literal that names its module", () => {
		const { project, paths } = createProject({
			"leak.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class LeakModule {
          static forRoot(): DynamicModule {
            const def = { module: LeakModule, providers: [Kept] };
            return def;
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("LeakModule")?.providers).toContain("Kept");
	});

	it("attributes a returned local literal without a module key to the enclosing class", () => {
		const { project, paths } = createProject({
			"kept.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class KeptModule {
          static forRoot(): DynamicModule {
            const def = { providers: [Kept2] };
            return def;
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("KeptModule")?.providers).toContain("Kept2");
	});

	it("attaches a setExtras transform only to modules extending its own built class", () => {
		const definitionAdding = (name: string) => `
        import { ConfigurableModuleBuilder } from '@nestjs/common';
        export const { ConfigurableModuleClass } =
          new ConfigurableModuleBuilder<{ enabled: boolean }>()
            .setExtras({}, (def, extras) => ({ ...def, providers: [...(def.providers ?? []), ${name}] }))
            .build();
      `;
		const { project, paths } = createProject({
			"http.module-definition.ts": definitionAdding("HttpMetrics"),
			"queue.module-definition.ts": definitionAdding("QueueMetrics"),
			"http.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigurableModuleClass } from './http.module-definition.js';
        @Module({})
        export class HttpModule extends ConfigurableModuleClass {}
      `,
			"queue.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigurableModuleClass } from './queue.module-definition.js';
        @Module({})
        export class QueueModule extends ConfigurableModuleClass {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const http = graph.modules.get("HttpModule")?.providers;
		const queue = graph.modules.get("QueueModule")?.providers;
		expect(http).toContain("HttpMetrics");
		expect(http).not.toContain("QueueMetrics");
		expect(queue).toContain("QueueMetrics");
		expect(queue).not.toContain("HttpMetrics");
	});

	it("builds the same dynamic metadata batched as it does in one pass", async () => {
		const { project, paths } = createProject(forRootRepro);
		const sync = buildModuleGraph(project, paths);
		const batched = await buildModuleGraphAsync(project, paths);
		expect(batched.modules.get("CacheModule")?.providers).toEqual(
			sync.modules.get("CacheModule")?.providers
		);
		expect(batched.modules.get("CacheModule")?.exports).toEqual(
			sync.modules.get("CacheModule")?.exports
		);
		expect(sync.modules.get("CacheModule")?.providers).toContain(
			"CacheService"
		);
		expect(batched.providerToModule.get("CacheService")?.name).toBe(
			"CacheModule"
		);
	});

	it("collects file-level pushes onto a providers array", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        const providers = [A];
        if (flag) { providers.push(B); }
        providers.push(C);
        @Module({ providers })
        export class AModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AModule")?.providers).toEqual(["A", "B", "C"]);
	});

	it("ignores pushes onto a shadowing variable", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class AModule {
          static forRoot(): DynamicModule {
            const providers = [A];
            { const providers = [Z]; providers.push(ZZ); }
            return { module: AModule, providers };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("AModule")?.providers).toEqual(["A"]);
	});

	it("ignores a return inside a nested function when deciding what is returned", () => {
		const { project, paths } = createProject({
			"m.module.ts": `
        import { Module } from '@nestjs/common';
        import type { ModuleMetadata } from '@nestjs/common';
        @Module({})
        export class MModule {
          static m(): ModuleMetadata {
            const meta = { providers: [T4] };
            const inner = () => { const meta = 1; return meta; };
            return { providers: [] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("MModule")?.providers).not.toContain("T4");
	});

	it("follows a conditional return of two literals", () => {
		const { project, paths } = createProject({
			"c.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule } from '@nestjs/common';
        @Module({})
        export class CModule {
          static forRoot(on: boolean): DynamicModule {
            return on ? { module: CModule, providers: [A] } : { module: CModule, providers: [B] };
          }
        }
        @Module({})
        export class DModule {
          static forRoot(on: boolean): DynamicModule {
            return on ? { providers: [A] } : { providers: [B] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CModule")?.providers).toEqual(["A", "B"]);
		expect(graph.modules.get("DModule")?.providers).toEqual(["A", "B"]);
	});

	it("attaches a setExtras transform through a barrel re-export", () => {
		const { project, paths } = createProject({
			"def.ts": `
        import { ConfigurableModuleBuilder } from '@nestjs/common';
        export const { ConfigurableModuleClass } =
          new ConfigurableModuleBuilder<{ enabled: boolean }>()
            .setExtras({}, (def, extras) => ({ ...def, providers: [...(def.providers ?? []), Extra] }))
            .build();
      `,
			"barrel.ts": "export { ConfigurableModuleClass } from './def.js';",
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigurableModuleClass } from './barrel.js';
        @Module({})
        export class BModule extends ConfigurableModuleClass {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("BModule")?.providers).toContain("Extra");
	});

	it("registers a this.forRootAsync useClass on the enclosing module", () => {
		const { project, paths } = createProject({
			"x.module.ts": `
        import { Module } from '@nestjs/common';
        import type { DynamicModule, Type } from '@nestjs/common';
        @Module({})
        export class XModule {
          static forRoot(): DynamicModule {
            return this.forRootAsync({ useClass: Self });
          }
          static forRootAsync(o: { useClass: Type }): DynamicModule {
            return { module: XModule, providers: [] };
          }
        }
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("XModule")?.providers).toContain("Self");
	});

	it("registers async options passed through a variable", () => {
		const { project, paths } = createProject({
			"orm.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class OrmModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { OrmModule } from './orm.module';
        const typeOrmAsyncConfig = { useClass: Cfg2 };
        @Module({
          imports: [
            OrmModule.forRootAsync(typeOrmAsyncConfig),
            OrmModule.forRootAsync(cond ? { useClass: Cfg4 } : {}),
          ],
        })
        export class AppModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		const providers = graph.modules.get("OrmModule")?.providers;
		expect(providers).toContain("Cfg2");
		expect(providers).toContain("Cfg4");
	});

	it("gives a detached graph its own per-file record", () => {
		const { project, paths } = createProject(forRootRepro);
		const graph = buildModuleGraph(project, paths);
		const detached = detachModuleGraph(graph);
		const original = graph.modules.get("CacheModule")?.dynamicByFile;
		const copy = detached.modules.get("CacheModule")?.dynamicByFile;
		expect(original).toBeDefined();
		expect(copy).not.toBe(original);
		expect(copy).toEqual(original);
	});

	it("ignores an async options call in a test file", () => {
		const { project, paths } = createProject({
			"redis.config.ts": "export class RedisConfig {}",
			"options.ts": `
        import { RedisConfig } from './redis.config.js';
        export const cacheOptions = { useClass: RedisConfig };
      `,
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
      `,
			"cache.module.spec.ts": `
        import { Test } from '@nestjs/testing';
        import { CacheModule } from './cache.module.js';
        import { cacheOptions } from './options.js';
        Test.createTestingModule({ imports: [CacheModule.forRootAsync(cacheOptions)] });
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toEqual([]);
	});

	it("registers one options object on every module it is passed to", () => {
		const { project, paths } = createProject({
			"cache.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
      `,
			"other.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class OtherModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { CacheModule } from './cache.module';
        import { OtherModule } from './other.module';
        const opts = { useClass: SharedConfig };
        @Module({
          imports: [CacheModule.forRootAsync(opts), OtherModule.registerAsync(opts)],
        })
        export class AppModule {}
      `,
		});
		const graph = buildModuleGraph(project, paths);
		expect(graph.modules.get("CacheModule")?.providers).toContain(
			"SharedConfig"
		);
		expect(graph.modules.get("OtherModule")?.providers).toContain(
			"SharedConfig"
		);
	});

	describe("updateModuleGraphForFile", () => {
		const emptyCacheModule = `
        import { Module } from '@nestjs/common';
        @Module({})
        export class CacheModule {}
      `;
		const helperWith = (providers: string) => `
        import type { DynamicModule } from '@nestjs/common';
        import { CacheModule } from './cache.module';
        export function makeCacheModule(): DynamicModule {
          return { module: CacheModule, providers: [${providers}] };
        }
      `;

		it("keeps forRoot providers when the module's own file is rescanned", () => {
			const { project, paths } = createProject(forRootRepro);
			const graph = buildModuleGraph(project, paths);
			updateModuleGraphForFile(graph, project, "cache.module.ts");
			expect(graph.modules.get("CacheModule")?.providers).toContain(
				"CacheService"
			);
		});

		it("drops a provider removed from a cross-file helper", () => {
			const { project, paths } = createProject({
				"cache.module.ts": emptyCacheModule,
				"make-cache-module.ts": helperWith("CacheService"),
			});
			const graph = buildModuleGraph(project, paths);
			expect(graph.modules.get("CacheModule")?.providers).toContain(
				"CacheService"
			);
			project
				.getSourceFileOrThrow("make-cache-module.ts")
				.replaceWithText(helperWith(""));
			updateModuleGraphForFile(graph, project, "make-cache-module.ts");
			expect(graph.modules.get("CacheModule")?.providers).not.toContain(
				"CacheService"
			);
		});

		it("adds a provider added to a cross-file helper", () => {
			const { project, paths } = createProject({
				"cache.module.ts": emptyCacheModule,
				"make-cache-module.ts": helperWith(""),
			});
			const graph = buildModuleGraph(project, paths);
			project
				.getSourceFileOrThrow("make-cache-module.ts")
				.replaceWithText(helperWith("CacheService"));
			updateModuleGraphForFile(graph, project, "make-cache-module.ts");
			expect(graph.modules.get("CacheModule")?.providers).toContain(
				"CacheService"
			);
		});

		it("keeps providerToModule consistent after a helper edit", () => {
			const { project, paths } = createProject({
				"cache.module.ts": emptyCacheModule,
				"make-cache-module.ts": helperWith("CacheService"),
			});
			const graph = buildModuleGraph(project, paths);
			project
				.getSourceFileOrThrow("make-cache-module.ts")
				.replaceWithText(helperWith("CacheService, StatsService"));
			updateModuleGraphForFile(graph, project, "make-cache-module.ts");
			const cache = graph.modules.get("CacheModule");
			expect(graph.providerToModule.get("CacheService")).toBe(cache);
			expect(graph.providerToModule.get("StatsService")).toBe(cache);
		});

		it("drops providerToModule entries for a provider removed from a helper", () => {
			const { project, paths } = createProject({
				"cache.module.ts": emptyCacheModule,
				"make-cache-module.ts": helperWith("CacheService"),
			});
			const graph = buildModuleGraph(project, paths);
			project
				.getSourceFileOrThrow("make-cache-module.ts")
				.replaceWithText(helperWith(""));
			updateModuleGraphForFile(graph, project, "make-cache-module.ts");
			expect(graph.providerToModule.has("CacheService")).toBe(false);
		});

		it("picks up an existing contributor when an edit declares a new module", () => {
			const appModuleOnly = `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `;
			const { project, paths } = createProject({
				"app.module.ts": appModuleOnly,
				"reg.ts": `
        import type { DynamicModule } from '@nestjs/common';
        import { NewModule } from './app.module.js';
        export function makeNew(): DynamicModule {
          return { module: NewModule, providers: [NewService] };
        }
      `,
			});
			const graph = buildModuleGraph(project, paths);
			project.getSourceFileOrThrow("app.module.ts").replaceWithText(
				`${appModuleOnly}
        @Module({})
        export class NewModule {}
      `
			);
			updateModuleGraphForFile(graph, project, "app.module.ts");
			expect(graph.modules.get("NewModule")?.providers).toContain("NewService");
		});
		it("drops a setExtras contribution when the module stops extending the built class", () => {
			const { project, paths } = createProject({
				"def.ts": `
        import { ConfigurableModuleBuilder } from '@nestjs/common';
        export const { ConfigurableModuleClass } =
          new ConfigurableModuleBuilder<{ enabled: boolean }>()
            .setExtras({}, (d, e) => ({ ...d, providers: [...(d.providers ?? []), Extra] }))
            .build();
      `,
				"e.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigurableModuleClass } from './def.js';
        @Module({ providers: [PE] })
        export class EModule extends ConfigurableModuleClass {}
      `,
			});
			const graph = buildModuleGraph(project, paths);
			expect(graph.modules.get("EModule")?.providers).toContain("Extra");
			project.getSourceFileOrThrow("e.module.ts").replaceWithText(`
        import { Module } from '@nestjs/common';
        @Module({ providers: [PE] })
        export class EModule {}
      `);
			updateModuleGraphForFile(graph, project, "e.module.ts");
			expect(graph.modules.get("EModule")?.providers).toEqual(["PE"]);
		});

		it("follows an async options call edited in another file than its literal", () => {
			const appWith = (imports: string) => `
        import { Module } from '@nestjs/common';
        import { CacheModule } from './cache.module';
        import { cacheOptions } from './options';
        @Module({ imports: [${imports}] })
        export class AppModule {}
      `;
			const { project, paths } = createProject({
				"redis.config.ts": "export class RedisConfig {}",
				"options.ts": `
        import { RedisConfig } from './redis.config.js';
        export const cacheOptions = { useClass: RedisConfig };
      `,
				"cache.module.ts": emptyCacheModule,
				"app.module.ts": appWith("CacheModule.forRootAsync(cacheOptions)"),
			});
			const graph = buildModuleGraph(project, paths);
			expect(graph.modules.get("CacheModule")?.providers).toContain(
				"RedisConfig"
			);
			const app = project.getSourceFileOrThrow("app.module.ts");
			app.replaceWithText(appWith(""));
			updateModuleGraphForFile(graph, project, "app.module.ts");
			expect(graph.modules.get("CacheModule")?.providers).toEqual([]);
			app.replaceWithText(appWith("CacheModule.forRootAsync(cacheOptions)"));
			updateModuleGraphForFile(graph, project, "app.module.ts");
			expect(graph.modules.get("CacheModule")?.providers).toContain(
				"RedisConfig"
			);
		});
	});
});
