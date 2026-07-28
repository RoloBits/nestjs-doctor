import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { NestjsDoctorConfig } from "../../../src/common/config.js";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { buildModuleGraph } from "../../../src/engine/graph/module-graph.js";
import { resolveProviders } from "../../../src/engine/graph/type-resolver.js";
import { noCircularModuleDeps } from "../../../src/engine/rules/definitions/architecture/no-circular-module-deps.js";
import { noUnusedModuleExports } from "../../../src/engine/rules/definitions/performance/no-unused-module-exports.js";
import { noUnusedProviders } from "../../../src/engine/rules/definitions/performance/no-unused-providers.js";
import type { ProjectRule } from "../../../src/engine/rules/types.js";

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

	it("flags mutual forwardRef cycle by default (option disabled)", () => {
		const diags = runProjectRule(noCircularModuleDeps, {
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
		expect(diags.length).toBeGreaterThan(0);
	});

	it("suppresses mutual forwardRef cycle when ignoreForwardRefCycles is enabled", () => {
		const diags = runProjectRule(
			noCircularModuleDeps,
			{
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
			},
			{
				rules: {
					"architecture/no-circular-module-deps": {
						options: { ignoreForwardRefCycles: true },
					},
				},
			}
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags one-sided forwardRef cycle when ignoreForwardRefCycles is enabled", () => {
		const diags = runProjectRule(
			noCircularModuleDeps,
			{
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
			},
			{
				rules: {
					"architecture/no-circular-module-deps": {
						options: { ignoreForwardRefCycles: true },
					},
				},
			}
		);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("Circular");
	});

	it("still flags 3-module cycle if any edge is not forwardRef-wrapped (option enabled)", () => {
		const diags = runProjectRule(
			noCircularModuleDeps,
			{
				"a.module.ts": `
          import { forwardRef, Module } from '@nestjs/common';
          @Module({ imports: [forwardRef(() => BModule)] })
          export class AModule {}
        `,
				"b.module.ts": `
          import { forwardRef, Module } from '@nestjs/common';
          @Module({ imports: [forwardRef(() => CModule)] })
          export class BModule {}
        `,
				"c.module.ts": `
          import { Module } from '@nestjs/common';
          @Module({ imports: [AModule] })
          export class CModule {}
        `,
			},
			{
				rules: {
					"architecture/no-circular-module-deps": {
						options: { ignoreForwardRefCycles: true },
					},
				},
			}
		);
		expect(diags.length).toBeGreaterThan(0);
	});
});

describe("no-unused-providers", () => {
	it("does not flag a class registered with useClass", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [{ provide: 'USER_REPO', useClass: UserRepository }] })
        export class AppModule {}
      `,
			"user.repository.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class UserRepository {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("does not flag a base class that a provider extends", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [BaseService, ArticleService] })
        export class AppModule {}
      `,
			"base.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BaseService {}
      `,
			"article.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class ArticleService extends BaseService {}
      `,
		});
		expect(
			diags.filter((d) => d.message.includes("'BaseService'"))
		).toHaveLength(0);
	});

	it("still flags a provider nothing references", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [OrphanService] })
        export class AppModule {}
      `,
			"orphan.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class OrphanService {}
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("OrphanService");
	});
});

describe("no-unused-module-exports", () => {
	it("does not flag a @Global() module's token injected without an import", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"database.module.ts": `
        import { Global, Module } from '@nestjs/common';
        @Global()
        @Module({
          providers: [{ provide: DRIZZLE, useFactory: () => ({}) }],
          exports: [DRIZZLE],
        })
        export class DatabaseModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [DatabaseModule], providers: [] })
        export class AppModule {}
      `,
			"customers.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [CustomersRepository] })
        export class CustomersModule {}
      `,
			"customers.repository.ts": `
        import { Inject, Injectable } from '@nestjs/common';
        @Injectable()
        export class CustomersRepository {
          constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("still flags a @Global() export nothing injects", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"database.module.ts": `
        import { Global, Module } from '@nestjs/common';
        @Global()
        @Module({ providers: [UnusedService], exports: [UnusedService] })
        export class DatabaseModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [DatabaseModule], providers: [OtherService] })
        export class AppModule {}
      `,
			"other.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class OtherService {
          constructor(private readonly nothing: SomethingElse) {}
        }
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UnusedService");
	});

	it("counts an @Inject() token used by an importing module", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"config.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [], exports: ['CONFIG_TOKEN'] })
        export class ConfigModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [ConfigModule], providers: [AppService] })
        export class AppModule {}
      `,
			"app.service.ts": `
        import { Inject, Injectable } from '@nestjs/common';
        @Injectable()
        export class AppService {
          constructor(@Inject('CONFIG_TOKEN') private readonly config: Config) {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("still flags a plain export no importer uses", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [HelperService], exports: [HelperService] })
        export class SharedModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [SharedModule], providers: [AppService] })
        export class AppModule {}
      `,
			"app.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class AppService {
          constructor(private readonly other: OtherService) {}
        }
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("HelperService");
	});
});
