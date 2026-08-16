import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { DiagnoseResult } from "../../src/common/result.js";
import {
	buildModuleGraph,
	mergeModuleGraphs,
} from "../../src/engine/graph/module-graph.js";
import { serializeModuleGraph } from "../../src/report/formatters/module-serializer.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

const emptyResult: DiagnoseResult = {
	score: { value: 100, label: "Excellent" },
	diagnostics: [],
	project: {
		name: "app",
		nestVersion: "11.0.0",
		orm: "prisma",
		framework: "express",
		fileCount: 2,
		moduleCount: 2,
	},
	summary: {
		total: 0,
		errors: 0,
		warnings: 0,
		info: 0,
		byCategory: {
			security: 0,
			performance: 0,
			correctness: 0,
			architecture: 0,
			schema: 0,
		},
	},
	ruleErrors: [],
	elapsedMs: 1,
};

describe("module-serializer", () => {
	it("takes the project from the node, not from the first slash in its name", () => {
		const { project: api, paths: apiPaths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [PatientsModule.forRoot(), PatientsModule] })
        export class AppModule {}
      `,
		});
		const { project: shared, paths: sharedPaths } = createProject({
			"patients.module.ts": `
        import { Global, Module } from '@nestjs/common';
        @Global()
        @Module({ providers: [{ provide: 'PATIENTS', useClass: PatientsService }] })
        export class PatientsModule {}
      `,
		});

		const merged = mergeModuleGraphs(
			new Map([
				["@compass/api", buildModuleGraph(api, apiPaths)],
				["@compass/shared", buildModuleGraph(shared, sharedPaths)],
			])
		);

		const serialized = serializeModuleGraph(
			merged,
			emptyResult,
			["@compass/api", "@compass/shared"],
			["@compass/api/AppModule"]
		);

		const app = serialized.modules.find(
			(m) => m.name === "@compass/api/AppModule"
		)!;
		expect(app.project).toBe("@compass/api");
		// The same import listed plainly and dynamically collapses to one entry.
		expect(app.imports).toEqual(["@compass/shared/PatientsModule"]);
		expect(app.dynamicImports).toEqual({
			"@compass/shared/PatientsModule": "forRoot",
		});

		const patients = serialized.modules.find(
			(m) => m.name === "@compass/shared/PatientsModule"
		)!;
		expect(patients.project).toBe("@compass/shared");
		expect(patients.isGlobal).toBe(true);
		expect(patients.providerTokens).toEqual(["'PATIENTS'"]);

		expect(serialized.edges).toContainEqual({
			from: "@compass/api/AppModule",
			to: "@compass/shared/PatientsModule",
		});
		expect(serialized.bootstrapRoots).toEqual(["@compass/api/AppModule"]);
	});

	it("leaves project and bootstrapRoots unset for a single project", () => {
		const { project, paths } = createProject({
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
		});

		const serialized = serializeModuleGraph(
			buildModuleGraph(project, paths),
			emptyResult
		);

		expect(serialized.modules[0].name).toBe("AppModule");
		expect(serialized.modules[0].project).toBeUndefined();
		expect(serialized.bootstrapRoots).toBeUndefined();
	});
});
