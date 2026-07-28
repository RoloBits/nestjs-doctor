import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	buildModuleGraph,
	detachModuleGraph,
} from "../../src/engine/graph/module-graph.js";

function graphOf(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return buildModuleGraph(project, paths);
}

const FILES = {
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
};

describe("detachModuleGraph", () => {
	it("keeps no ts-morph node", () => {
		const detached = detachModuleGraph(graphOf(FILES));
		for (const [name, node] of detached.modules) {
			expect(node.classDeclaration, name).toBeUndefined();
		}
	});

	it("keeps the same modules, edges and provider index", () => {
		const original = graphOf(FILES);
		const detached = detachModuleGraph(original);

		expect([...detached.modules.keys()].sort()).toEqual(
			[...original.modules.keys()].sort()
		);
		expect([...detached.edges.keys()].sort()).toEqual(
			[...original.edges.keys()].sort()
		);
		expect(detached.providerToModule.size).toBe(original.providerToModule.size);
	});

	it("points the provider index at the detached nodes", () => {
		const detached = detachModuleGraph(graphOf(FILES));
		for (const [provider, node] of detached.providerToModule) {
			expect(node.classDeclaration, provider).toBeUndefined();
			expect(detached.modules.get(node.name), provider).toBe(node);
		}
	});

	it("does not share edge sets with the original", () => {
		const original = graphOf(FILES);
		const detached = detachModuleGraph(original);

		original.edges.get("AppModule")?.add("InjectedLater");
		expect(detached.edges.get("AppModule")?.has("InjectedLater")).toBe(false);
	});
});
