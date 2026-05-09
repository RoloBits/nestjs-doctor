import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../src/common/diagnostic.js";
import {
	buildModuleGraph,
	findCircularDeps,
	type ModuleGraph,
	type ModuleNode,
	mergeModuleGraphs,
} from "../../src/engine/graph/module-graph.js";
import { resolveProviders } from "../../src/engine/graph/type-resolver.js";
import { noCircularModuleDeps } from "../../src/engine/rules/definitions/architecture/no-circular-module-deps.js";

function runProjectRule(files: Record<string, string>): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}

	const moduleGraph = buildModuleGraph(project, paths);
	const providers = resolveProviders(project, paths);

	const diagnostics: Diagnostic[] = [];
	noCircularModuleDeps.check({
		project,
		files: paths,
		moduleGraph,
		providers,
		config: {},
		report(partial) {
			diagnostics.push({
				...partial,
				rule: noCircularModuleDeps.meta.id,
				category: noCircularModuleDeps.meta.category,
				severity: noCircularModuleDeps.meta.severity,
			});
		},
	});
	return diagnostics;
}

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

function findByFilePath(
	graph: ModuleGraph,
	name: string,
	filePathFragment: string
): ModuleNode {
	const bucket = graph.byName.get(name) ?? [];
	const found = bucket.find((n) => n.filePath.includes(filePathFragment));
	if (!found) {
		throw new Error(
			`No "${name}" with filePath fragment "${filePathFragment}" — got ${bucket.map((n) => n.filePath).join(", ")}`
		);
	}
	return found;
}

describe("module-graph — name-collision regressions (issue #110)", () => {
	it("preserves both modules when two files declare the same class name", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule, BModule] })
        export class SharedModule {}
        @Module({ imports: [SharedModule] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule, BModule] })
        export class SharedModule {}
        @Module({ imports: [SharedModule] })
        export class BModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const sharedModules = graph.byName.get("SharedModule") ?? [];
		expect(sharedModules).toHaveLength(2);
		expect(graph.modules.size).toBe(4); // SharedModule_a, AModule, SharedModule_b, BModule

		const sharedA = findByFilePath(graph, "SharedModule", "a.module.ts");
		const sharedB = findByFilePath(graph, "SharedModule", "b.module.ts");
		expect(sharedA.filePath).not.toBe(sharedB.filePath);
		expect(sharedA.key).not.toBe(sharedB.key);
	});

	it("attributes a cycle to the file that actually contains both edges", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule] })
        export class SharedModule {}
        @Module({ imports: [SharedModule] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [BModule] })
        export class SharedModule {}
        @Module({ imports: [SharedModule] })
        export class BModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const cycles = findCircularDeps(graph);
		expect(cycles.length).toBeGreaterThanOrEqual(2);

		// For each cycle, both members' filePaths must come from the same file —
		// the bug was that cycle[0] resolved to the survivor's filePath even when
		// the other member lived in a different file.
		for (const cycle of cycles) {
			const nodes = cycle.map((k) => graph.modules.get(k));
			expect(nodes.every(Boolean)).toBe(true);
			const filePaths = new Set(nodes.map((n) => n!.filePath));
			expect(filePaths.size).toBe(1);
		}
	});

	it("treats two default-exported anonymous modules as distinct nodes", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export default class {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export default class {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const anon = graph.byName.get("AnonymousModule") ?? [];
		expect(anon).toHaveLength(2);
		expect(anon[0].key).not.toBe(anon[1].key);
		expect(anon[0].filePath).not.toBe(anon[1].filePath);
	});

	it("flags a 3-module cycle correctly when one cycle node has a name collision", () => {
		const { project, paths } = createProject({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [SharedModule] })
        export class AModule {}
        @Module({ imports: [BModule] })
        export class SharedModule {}
        @Module({ imports: [AModule] })
        export class BModule {}
      `,
			"orphan.module.ts": `
        import { Module } from '@nestjs/common';
        // Orphan module with same class name — must not be wired into the cycle above
        @Module({})
        export class SharedModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const cycles = findCircularDeps(graph);
		expect(cycles.length).toBeGreaterThan(0);

		// All cycle members must come from a.module.ts; the orphan SharedModule in
		// orphan.module.ts must not appear because nobody imports from it.
		for (const cycle of cycles) {
			const nodes = cycle.map((k) => graph.modules.get(k)!);
			for (const node of nodes) {
				expect(node.filePath).toBe("a.module.ts");
			}
		}
	});

	it("preserves distinct same-class-name modules across project boundaries when merged", () => {
		const { project: p1, paths: paths1 } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
		});
		const { project: p2, paths: paths2 } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
		});

		const merged = mergeModuleGraphs(
			new Map([
				["api", buildModuleGraph(p1, paths1)],
				["admin", buildModuleGraph(p2, paths2)],
			])
		);

		expect(merged.modules.size).toBe(2);
		const apps = merged.byName.get("AppModule") ?? [];
		expect(apps).toHaveLength(2);
		const apiApp = apps.find((n) => n.key.startsWith("api/"));
		const adminApp = apps.find((n) => n.key.startsWith("admin/"));
		expect(apiApp).toBeDefined();
		expect(adminApp).toBeDefined();
		expect(apiApp!.key).not.toBe(adminApp!.key);
	});

	it("binds to the explicitly imported module when a same-named module exists elsewhere", () => {
		const { project, paths } = createProject({
			"a/shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class SharedModule {}
      `,
			"b/shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class SharedModule {}
      `,
			"consumer.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedModule } from './a/shared.module';
        @Module({ imports: [SharedModule] })
        export class ConsumerModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const consumer = findByFilePath(
			graph,
			"ConsumerModule",
			"consumer.module.ts"
		);
		const consumerEdges = graph.edges.get(consumer.key);
		expect(consumerEdges?.size).toBe(1);
		const sharedA = findByFilePath(graph, "SharedModule", "a/shared.module.ts");
		expect(consumerEdges?.has(sharedA.key)).toBe(true);
	});

	it("follows barrel re-exports under name collision", () => {
		const { project, paths } = createProject({
			"a/shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class SharedModule {}
      `,
			"b/shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class SharedModule {}
      `,
			"a/index.ts": `
        export { SharedModule } from './shared.module';
      `,
			"consumer.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedModule } from './a';
        @Module({ imports: [SharedModule] })
        export class ConsumerModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const consumer = findByFilePath(
			graph,
			"ConsumerModule",
			"consumer.module.ts"
		);
		const consumerEdges = graph.edges.get(consumer.key);
		expect(consumerEdges?.size).toBe(1);
		const sharedA = findByFilePath(graph, "SharedModule", "a/shared.module.ts");
		expect(consumerEdges?.has(sharedA.key)).toBe(true);
	});

	it("handles a self-import without crashing", () => {
		const { project, paths } = createProject({
			"loop.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [LoopModule] })
        export class LoopModule {}
      `,
		});

		const graph = buildModuleGraph(project, paths);
		const cycles = findCircularDeps(graph);
		expect(cycles.length).toBeGreaterThan(0);
		const cycle = cycles[0];
		// Cycle must contain only this module's composite key
		for (const key of cycle) {
			expect(key).toContain("LoopModule");
		}
	});
});

describe("no-circular-module-deps — diagnostic file attribution (issue #110)", () => {
	it("reports the cycle on the file that actually contains the cycle members", () => {
		const diags = runProjectRule({
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule] })
        export class SharedModule {}
        @Module({ imports: [SharedModule] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [BModule] })
        export class SharedModule {}
        @Module({ imports: [SharedModule] })
        export class BModule {}
      `,
		});

		expect(diags.length).toBeGreaterThanOrEqual(2);

		// Each diagnostic's filePath must be a file that actually contains the cycle —
		// before the fix, the diagnostic for the a.module.ts cycle landed on b.module.ts.
		const filePathsCovered = new Set(diags.map((d) => d.filePath));
		expect(filePathsCovered.has("a.module.ts")).toBe(true);
		expect(filePathsCovered.has("b.module.ts")).toBe(true);
	});
});
