import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../../../src/engine/module-graph.js";
import { resolveProviders } from "../../../src/engine/type-resolver.js";
import { noCircularModuleDeps } from "../../../src/rules/architecture/no-circular-module-deps.js";
import type { ProjectRule } from "../../../src/rules/types.js";
import type { NestjsDoctorConfig } from "../../../src/types/config.js";
import type { Diagnostic } from "../../../src/types/diagnostic.js";

function createProjectContext(
	files: Record<string, string>,
	config: NestjsDoctorConfig = {}
) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}

	const moduleGraph = buildModuleGraph(project, paths);
	const providers = resolveProviders(project, paths);

	return { project, paths, moduleGraph, providers, config };
}

function runProjectRule(
	rule: ProjectRule,
	files: Record<string, string>,
	config: NestjsDoctorConfig = {}
): Diagnostic[] {
	const ctx = createProjectContext(files, config);
	const diagnostics: Diagnostic[] = [];

	rule.check({
		...ctx,
		files: ctx.paths,
		report(partial) {
			diagnostics.push({
				...partial,
				rule: rule.meta.id,
				category: rule.meta.category,
				severity: rule.meta.severity,
			});
		},
	});

	return diagnostics;
}

describe("no-circular-module-deps", () => {
	it("detects circular dependencies", () => {
		const diags = runProjectRule(noCircularModuleDeps, {
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
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("Circular");
	});

	it("does not flag acyclic imports", () => {
		const diags = runProjectRule(noCircularModuleDeps, {
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
		expect(diags).toHaveLength(0);
	});
});
