import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import { buildModuleGraph } from "../../src/engine/graph/module-graph.js";
import { pruneCrossProjectOrphans } from "../../src/engine/orphan-prune.js";
import type { EngineResult } from "../../src/engine/result-builder.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

function orphanDiag(
	filePath: string,
	moduleName: string,
	line: number
): CodeDiagnostic {
	return {
		rule: "performance/no-orphan-modules",
		category: "performance",
		severity: "warning",
		scope: "project",
		filePath,
		line,
		column: 1,
		message: `Module '${moduleName}' is never imported by any other module.`,
		help: "h",
	};
}

function engineResult(
	moduleGraph: ReturnType<typeof buildModuleGraph>,
	diagnostics: CodeDiagnostic[]
): EngineResult {
	return {
		moduleGraph,
		result: {
			diagnostics,
			score: 100,
			project: { fileCount: 1 },
			summary: { total: diagnostics.length, errors: 0, warnings: 0, info: 0 },
		},
	} as unknown as EngineResult;
}

describe("pruneCrossProjectOrphans", () => {
	it("keeps a dead module's finding when a co-located module is imported", () => {
		const shared = createProject({
			"both.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({})
				export class ImportedModule {}
				@Module({})
				export class DeadModule {}
			`,
		});
		const consumer = createProject({
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				import { ImportedModule } from './imported.module';
				@Module({ imports: [ImportedModule] })
				export class AppModule {}
			`,
		});
		const sharedGraph = buildModuleGraph(shared.project, shared.paths);
		const consumerGraph = buildModuleGraph(consumer.project, consumer.paths);
		const importedLine = sharedGraph.modules.get("ImportedModule")?.line ?? 0;
		const deadLine = sharedGraph.modules.get("DeadModule")?.line ?? 0;
		const scanResults = new Map<string, EngineResult>([
			[
				"shared",
				engineResult(sharedGraph, [
					orphanDiag("both.module.ts", "ImportedModule", importedLine),
					orphanDiag("both.module.ts", "DeadModule", deadLine),
				]),
			],
			["api", engineResult(consumerGraph, [])],
		]);

		pruneCrossProjectOrphans(scanResults, []);

		const kept = scanResults
			.get("shared")
			?.result.diagnostics.map((d) => d.message)
			.join("\n");
		expect(kept).not.toContain("ImportedModule");
		expect(kept).toContain("DeadModule");
	});
});
