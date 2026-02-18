import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../../../src/engine/module-graph.js";
import { resolveProviders } from "../../../src/engine/type-resolver.js";
import { noBlockingConstructor } from "../../../src/rules/performance/no-blocking-constructor.js";
import { noDynamicRequire } from "../../../src/rules/performance/no-dynamic-require.js";
import { noLoggingInLoops } from "../../../src/rules/performance/no-logging-in-loops.js";
import { noOrphanModules } from "../../../src/rules/performance/no-orphan-modules.js";
import { noQueryInLoop } from "../../../src/rules/performance/no-query-in-loop.js";
import { noSyncIo } from "../../../src/rules/performance/no-sync-io.js";
import { noUnnecessaryAsync } from "../../../src/rules/performance/no-unnecessary-async.js";
import { noUnusedModuleExports } from "../../../src/rules/performance/no-unused-module-exports.js";
import { noUnusedProviders } from "../../../src/rules/performance/no-unused-providers.js";
import { preferPagination } from "../../../src/rules/performance/prefer-pagination.js";
import type { ProjectRule, Rule } from "../../../src/rules/types.js";
import type { NestjsDoctorConfig } from "../../../src/types/config.js";
import type { Diagnostic } from "../../../src/types/diagnostic.js";

function runRule(rule: Rule, code: string, filePath = "test.ts"): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile(filePath, code);
	const diagnostics: Diagnostic[] = [];

	rule.check({
		sourceFile,
		filePath,
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

function runProjectRule(
	rule: ProjectRule,
	files: Record<string, string>,
	config: NestjsDoctorConfig = {}
): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}

	const moduleGraph = buildModuleGraph(project, paths);
	const providers = resolveProviders(project, paths);
	const diagnostics: Diagnostic[] = [];

	rule.check({
		project,
		files: paths,
		moduleGraph,
		providers,
		config,
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

describe("no-sync-io", () => {
	it("flags readFileSync", () => {
		const diags = runRule(
			noSyncIo,
			`
      import { readFileSync } from 'fs';
      const data = readFileSync('file.txt');
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("readFileSync");
	});

	it("flags fs.writeFileSync", () => {
		const diags = runRule(
			noSyncIo,
			`
      import * as fs from 'fs';
      fs.writeFileSync('file.txt', 'data');
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("writeFileSync");
	});

	it("does not flag async readFile", () => {
		const diags = runRule(
			noSyncIo,
			`
      import { readFile } from 'fs/promises';
      const data = await readFile('file.txt');
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-query-in-loop", () => {
	it("flags await inside for-of loop", () => {
		const diags = runRule(
			noQueryInLoop,
			`
      async function process(items: string[]) {
        for (const item of items) {
          await db.findOne(item);
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("N+1");
	});

	it("flags await inside while loop", () => {
		const diags = runRule(
			noQueryInLoop,
			`
      async function process() {
        let i = 0;
        while (i < 10) {
          await db.query(i);
          i++;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("allows await outside loops", () => {
		const diags = runRule(
			noQueryInLoop,
			`
      async function process() {
        const data = await db.findAll();
        return data;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-logging-in-loops", () => {
	it("flags console.log inside for loop", () => {
		const diags = runRule(
			noLoggingInLoops,
			`
      for (const item of items) {
        console.log(item);
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("console.log");
	});

	it("flags this.logger.log inside loop", () => {
		const diags = runRule(
			noLoggingInLoops,
			`
      class MyService {
        process() {
          for (const item of items) {
            this.logger.log(item);
          }
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("allows logging outside loops", () => {
		const diags = runRule(
			noLoggingInLoops,
			`
      console.log('starting');
      for (const item of items) {
        process(item);
      }
      console.log('done');
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-unnecessary-async", () => {
	it("flags async method without await", () => {
		const diags = runRule(
			noUnnecessaryAsync,
			`
      export class MyService {
        async getStuff() {
          return 42;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("getStuff");
	});

	it("allows async method with await", () => {
		const diags = runRule(
			noUnnecessaryAsync,
			`
      export class MyService {
        async getStuff() {
          return await fetchData();
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-blocking-constructor", () => {
	it("flags constructor with for loop in @Injectable", () => {
		const diags = runRule(
			noBlockingConstructor,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor() {
          for (let i = 0; i < 100; i++) {
            // heavy work
          }
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("blocking");
	});

	it("allows simple constructor", () => {
		const diags = runRule(
			noBlockingConstructor,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor(private readonly dep: OtherService) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-Injectable classes", () => {
		const diags = runRule(
			noBlockingConstructor,
			`
      export class Helper {
        constructor() {
          for (let i = 0; i < 100; i++) {}
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("prefer-pagination", () => {
	it("flags findMany without pagination args", () => {
		const diags = runRule(
			preferPagination,
			`
      const users = await prisma.user.findMany();
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("pagination");
	});

	it("flags findMany with object but no pagination", () => {
		const diags = runRule(
			preferPagination,
			`
      const users = await prisma.user.findMany({ where: { active: true } });
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("allows findMany with take/skip", () => {
		const diags = runRule(
			preferPagination,
			`
      const users = await prisma.user.findMany({ take: 10, skip: 0 });
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-dynamic-require", () => {
	it("flags require with variable", () => {
		const diags = runRule(
			noDynamicRequire,
			`
      const mod = require(modulePath);
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("Dynamic require");
	});

	it("allows require with string literal", () => {
		const diags = runRule(
			noDynamicRequire,
			`
      const fs = require('fs');
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-unused-providers", () => {
	it("flags provider not injected anywhere", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [UnusedService] })
        export class AppModule {}
      `,
			"unused.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class UnusedService {
          doStuff() {}
        }
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UnusedService");
	});

	it("allows provider injected in another service", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [UsedService, ConsumerService] })
        export class AppModule {}
      `,
			"used.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class UsedService {
          doStuff() {}
        }
      `,
			"consumer.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class ConsumerService {
          constructor(private readonly used: UsedService) {}
        }
      `,
		});
		// ConsumerService might be flagged but UsedService should not
		const usedServiceDiags = diags.filter((d) =>
			d.message.includes("UsedService")
		);
		expect(usedServiceDiags).toHaveLength(0);
	});
});

describe("no-unused-module-exports", () => {
	it("flags exported provider not used by importing module", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"shared.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [SharedService], exports: [SharedService] })
        export class SharedModule {}
      `,
			"shared.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class SharedService {}
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
          doStuff() {}
        }
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("SharedService");
	});
});

describe("no-orphan-modules", () => {
	it("flags module never imported", () => {
		const diags = runProjectRule(noOrphanModules, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
			"orphan.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class OrphanModule {}
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("OrphanModule");
	});

	it("does not flag AppModule", () => {
		const diags = runProjectRule(noOrphanModules, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({})
        export class AppModule {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("does not flag imported module", () => {
		const diags = runProjectRule(noOrphanModules, {
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
