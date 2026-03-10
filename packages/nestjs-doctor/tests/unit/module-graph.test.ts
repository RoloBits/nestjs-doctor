import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	buildModuleGraph,
	findCircularDeps,
	findProviderModule,
	mergeModuleGraphs,
} from "../../src/engine/graph/module-graph.js";

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
		const app = graph.modules.get("AppModule")!;
		expect(app.imports).toEqual([]);
	});
});
