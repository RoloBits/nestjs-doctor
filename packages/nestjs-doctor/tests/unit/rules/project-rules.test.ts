import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../../../src/engine/module-graph.js";
import { resolveProviders } from "../../../src/engine/type-resolver.js";
import { noCircularModuleDeps } from "../../../src/rules/architecture/no-circular-module-deps.js";
import { noGodModule } from "../../../src/rules/architecture/no-god-module.js";
import { noGodService } from "../../../src/rules/architecture/no-god-service.js";
import { requireFeatureModules } from "../../../src/rules/architecture/require-feature-modules.js";
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

describe("no-god-module", () => {
	it("flags modules with too many providers", () => {
		const providers = Array.from({ length: 12 }, (_, i) => `Service${i}`).join(
			", "
		);

		const diags = runProjectRule(noGodModule, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [${providers}] })
        export class AppModule {}
      `,
		});
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("12 providers");
	});

	it("respects custom thresholds", () => {
		const diags = runProjectRule(
			noGodModule,
			{
				"app.module.ts": `
          import { Module } from '@nestjs/common';
          @Module({ providers: [A, B, C] })
          export class AppModule {}
        `,
			},
			{ thresholds: { godModuleProviders: 2 } }
		);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("allows modules within limits", () => {
		const diags = runProjectRule(noGodModule, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [A, B, C] })
        export class AppModule {}
      `,
		});
		expect(diags).toHaveLength(0);
	});
});

describe("no-god-service", () => {
	it("flags services with too many public methods", () => {
		const methods = Array.from(
			{ length: 12 },
			(_, i) => `method${i}() { return ${i}; }`
		).join("\n          ");

		const diags = runProjectRule(noGodService, {
			"big.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BigService {
          ${methods}
        }
      `,
		});
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("12 public methods");
	});

	it("flags services with too many dependencies", () => {
		const params = Array.from(
			{ length: 10 },
			(_, i) => `private readonly dep${i}: any`
		).join(",\n            ");

		const diags = runProjectRule(noGodService, {
			"big.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BigService {
          constructor(
            ${params}
          ) {}
        }
      `,
		});
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("10 dependencies");
	});

	it("allows services within limits", () => {
		const diags = runProjectRule(noGodService, {
			"small.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class SmallService {
          constructor(private readonly dep: any) {}
          doStuff() {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});
});

describe("require-feature-modules", () => {
	it("flags AppModule with too many direct providers", () => {
		const providers = Array.from({ length: 7 }, (_, i) => `Service${i}`).join(
			", "
		);

		const diags = runProjectRule(requireFeatureModules, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [UsersModule],
          providers: [${providers}],
        })
        export class AppModule {}
      `,
		});
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("7 providers");
	});

	it("does not flag AppModule with mostly feature module imports", () => {
		const diags = runProjectRule(requireFeatureModules, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          imports: [UsersModule, OrdersModule, AuthModule, MailModule],
          providers: [AppService],
        })
        export class AppModule {}
      `,
		});
		expect(diags).toHaveLength(0);
	});
});
