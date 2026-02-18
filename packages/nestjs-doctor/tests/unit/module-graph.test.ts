import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	buildModuleGraph,
	findCircularDeps,
	findProviderModule,
} from "../../src/engine/module-graph.js";

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
});
