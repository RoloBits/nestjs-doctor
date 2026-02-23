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

	it("provides concrete help naming providers in a simple A <-> B cycle", () => {
		const diags = runProjectRule(noCircularModuleDeps, {
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [BModule], providers: [AService] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule], providers: [BService] })
        export class BModule {}
      `,
			"a.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class AService {
          constructor(private readonly bService: BService) {}
        }
      `,
			"b.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BService {
          constructor(private readonly aService: AService) {}
        }
      `,
		});
		expect(diags.length).toBeGreaterThan(0);
		const help = diags[0].help;
		expect(help).toContain("AService");
		expect(help).toContain("BService");
		expect(help).toContain("Consider extracting");
	});

	it("falls back to generic help when no provider edges are found", () => {
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
		expect(diags[0].help).toContain("forwardRef()");
	});

	it("identifies weakest link in a 3-module cycle", () => {
		const diags = runProjectRule(noCircularModuleDeps, {
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [BModule], providers: [AService] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [CModule], providers: [BService, BHelper] })
        export class BModule {}
      `,
			"c.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule], providers: [CService] })
        export class CModule {}
      `,
			"a.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class AService {
          constructor(private readonly bService: BService) {}
        }
      `,
			"b.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BService {
          constructor(private readonly cService: CService) {}
        }
      `,
			"b.helper.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BHelper {
          constructor(private readonly cService: CService) {}
        }
      `,
			"c.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class CService {
          constructor(private readonly aService: AService) {}
        }
      `,
		});
		expect(diags.length).toBeGreaterThan(0);
		const help = diags[0].help;
		// A->B has 1 dep (weakest), B->C has 2, C->A has 1
		// Should suggest extracting one of the weakest edges
		expect(help).toContain("Consider extracting");
		expect(help).toContain("shared module");
	});

	it("includes controller dependencies in help text", () => {
		const diags = runProjectRule(noCircularModuleDeps, {
			"a.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [BModule], controllers: [AController] })
        export class AModule {}
      `,
			"b.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [AModule], providers: [BService] })
        export class BModule {}
      `,
			"a.controller.ts": `
        import { Controller } from '@nestjs/common';
        @Controller()
        export class AController {
          constructor(private readonly bService: BService) {}
        }
      `,
			"b.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BService {}
      `,
		});
		expect(diags.length).toBeGreaterThan(0);
		const help = diags[0].help;
		// AController injects BService from BModule
		expect(help).toContain("AController");
		expect(help).toContain("BService");
	});
});
