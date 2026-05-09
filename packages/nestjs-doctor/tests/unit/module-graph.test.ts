import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	buildModuleGraph,
	findCircularDeps,
	findProviderModule,
	type ModuleGraph,
	type ModuleNode,
	mergeModuleGraphs,
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

function getByName(graph: ModuleGraph, name: string): ModuleNode {
	const bucket = graph.byName.get(name);
	if (!bucket || bucket.length === 0) {
		throw new Error(`Module "${name}" not found in graph`);
	}
	return bucket[0];
}

function edgesFromName(
	graph: ModuleGraph,
	fromName: string
): Set<string> | undefined {
	const node = graph.byName.get(fromName)?.[0];
	return node ? graph.edges.get(node.key) : undefined;
}

function edgeHas(
	graph: ModuleGraph,
	fromName: string,
	toName: string
): boolean {
	const targetKey = graph.byName.get(toName)?.[0]?.key;
	if (!targetKey) {
		return false;
	}
	return edgesFromName(graph, fromName)?.has(targetKey) ?? false;
}

describe("module-graph", () => {
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
		expect(graph.byName.has("AppModule")).toBe(true);
		expect(graph.byName.has("UsersModule")).toBe(true);

		const app = getByName(graph, "AppModule")!;
		expect(app.imports).toContain("UsersModule");
		expect(app.providers).toContain("AppService");
		expect(app.controllers).toContain("AppController");

		const users = getByName(graph, "UsersModule")!;
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
		expect(edgeHas(graph, "AppModule", "UsersModule")).toBe(true);
		expect(edgeHas(graph, "AppModule", "OrdersModule")).toBe(true);
		expect(edgeHas(graph, "OrdersModule", "UsersModule")).toBe(true);
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

		// All three modules merged; class names appear under byName, possibly with collisions across projects
		expect(merged.modules.size).toBe(3);
		expect(merged.byName.has("AppModule")).toBe(true);
		expect(merged.byName.has("UsersModule")).toBe(true);
		expect(merged.byName.get("AppModule")).toHaveLength(2);

		// Per-project nodes are distinguished by the composite key prefix
		const apiApp = merged.byName
			.get("AppModule")!
			.find((n) => n.key.startsWith("api/"))!;
		const adminApp = merged.byName
			.get("AppModule")!
			.find((n) => n.key.startsWith("admin/"))!;
		expect(apiApp).toBeDefined();
		expect(adminApp).toBeDefined();
		expect(apiApp.name).toBe("AppModule");
		expect(adminApp.name).toBe("AppModule");

		// imports stays as class names (display-friendly); edges carry the composite-key wiring
		expect(apiApp.imports).toContain("UsersModule");

		const apiUsers = merged.byName
			.get("UsersModule")!
			.find((n) => n.key.startsWith("api/"))!;
		expect(apiUsers.exports).toContain("UsersService");

		// Edges are keyed by the prefixed composite key
		expect(merged.edges.get(apiApp.key)?.has(apiUsers.key)).toBe(true);

		// providerToModule key is project-prefixed; value points at the merged node
		const providerModule = merged.providerToModule.get("api/AppService");
		expect(providerModule).toBe(apiApp);
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
		const aModule = getByName(graph, "AModule");
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
		const a = getByName(graph, "AModule");
		const b = getByName(graph, "BModule");
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
		const a = merged.byName.get("AModule")?.[0];
		// `forwardRefImports` stores class names (matches `imports`), so it stays
		// unchanged through the merge — no project prefix.
		expect(a?.forwardRefImports).toEqual(new Set(["BModule"]));
		// `key` carries the project prefix on the composite identity.
		expect(a?.key.startsWith("api/")).toBe(true);
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
		const a = getByName(graph, "AModule");
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
		const app = getByName(graph, "AppModule")!;
		expect(app.imports).toContain("ConfigModule");
		expect(edgeHas(graph, "AppModule", "ConfigModule")).toBe(true);
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Ternary or other unresolvable expressions should not throw — they return empty imports
	it("gracefully handles unresolvable expressions", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: someCondition ? [AuthModule] : [UsersModule],
        })
        export class AppModule {}
      `,
		});

		// Should not throw, just return empty imports
		const graph = buildModuleGraph(project, paths);
		const app = getByName(graph, "AppModule")!;
		expect(app.imports).toEqual([]);
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});

	// Barrel file re-export: export { X } from './other' should resolve through
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
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
		const app = getByName(graph, "AppModule")!;
		expect(app.imports).toContain("DatabaseModule");
		expect(edgeHas(graph, "AppModule", "DatabaseModule")).toBe(true);
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
		const app = getByName(graph, "AppModule")!;
		expect(app.imports).toContain("AuthModule");
		expect(app.imports).toContain("UsersModule");
	});
});
