import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { NestjsDoctorConfig } from "../../../src/common/config.js";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { buildModuleGraph } from "../../../src/engine/graph/module-graph.js";
import { resolveProviders } from "../../../src/engine/graph/type-resolver.js";
import { noBlockingConstructor } from "../../../src/engine/rules/definitions/performance/no-blocking-constructor.js";
import { noDynamicRequire } from "../../../src/engine/rules/definitions/performance/no-dynamic-require.js";
import { noOrphanModules } from "../../../src/engine/rules/definitions/performance/no-orphan-modules.js";
import { noRequestScopeAbuse } from "../../../src/engine/rules/definitions/performance/no-request-scope-abuse.js";
import { noSyncIo } from "../../../src/engine/rules/definitions/performance/no-sync-io.js";
import { noUnusedModuleExports } from "../../../src/engine/rules/definitions/performance/no-unused-module-exports.js";
import { noUnusedProviders } from "../../../src/engine/rules/definitions/performance/no-unused-providers.js";
import type { ProjectRule, Rule } from "../../../src/engine/rules/types.js";

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

	it("allows provider with @Cron() method decorator", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [HealthCron] })
        export class AppModule {}
      `,
			"health.cron.ts": `
        import { Injectable } from '@nestjs/common';
        import { Cron } from '@nestjs/schedule';
        @Injectable()
        export class HealthCron {
          @Cron('0 */5 * * * *')
          async handleCron() {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("allows provider with @OnEvent() method decorator", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [OrderListener] })
        export class AppModule {}
      `,
			"order.listener.ts": `
        import { Injectable } from '@nestjs/common';
        import { OnEvent } from '@nestjs/event-emitter';
        @Injectable()
        export class OrderListener {
          @OnEvent('order.created')
          handleOrderCreated() {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("allows provider with Subscriber suffix", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [UserSubscriber] })
        export class AppModule {}
      `,
			"user.subscriber.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class UserSubscriber {
          afterInsert() {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("allows provider with @Process() method decorator", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [EmailProcessor] })
        export class AppModule {}
      `,
			"email.processor.ts": `
        import { Injectable } from '@nestjs/common';
        import { Process } from '@nestjs/bull';
        @Injectable()
        export class EmailProcessor {
          @Process('send')
          handleSend() {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
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

	it("does not flag a provider registered through a function-returned useClass", () => {
		const diags = runProjectRule(noUnusedProviders, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { AppService } from './app.service.js';
        function providerFactory() { return AppService; }
        @Module({ providers: [{ provide: AppService, useClass: providerFactory() }] })
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
		expect(diags.filter((d) => d.message.includes("AppService"))).toHaveLength(
			0
		);
	});
});

describe("no-unused-module-exports", () => {
	it("allows export used by importing module's provider", () => {
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
          constructor(private readonly shared: SharedService) {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("allows export when importing module re-exports the module", () => {
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
			"core.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [SharedModule], exports: [SharedModule] })
        export class CoreModule {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ imports: [CoreModule] })
        export class AppModule {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

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

	it("allows export used through a function-returned useClass", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"shared.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedService } from './shared.service';
        @Module({ providers: [SharedService], exports: [SharedService] })
        export class SharedModule {}
      `,
			"shared.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class SharedService {}
      `,
			"pick-shared.ts": `
        import { SharedService } from './shared.service';
        export function pickShared() { return SharedService }
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedModule } from './shared.module';
        import { pickShared } from './pick-shared';
        @Module({ imports: [SharedModule], providers: [{ provide: 'TOK', useClass: pickShared() }] })
        export class AppModule {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("allows export consumed only through a factory inject array", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"config.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigService } from './config.service';
        @Module({ providers: [ConfigService], exports: [ConfigService] })
        export class ConfigModule {}
      `,
			"config.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class ConfigService {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { ConfigModule } from './config.module';
        import { ConfigService } from './config.service';
        @Module({
          imports: [ConfigModule],
          providers: [{ provide: 'URL', useFactory: (c: ConfigService) => c, inject: [ConfigService] }],
        })
        export class AppModule {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("still flags an export only a non-importing module registers", () => {
		const diags = runProjectRule(noUnusedModuleExports, {
			"shared.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedService } from './shared.service';
        @Module({ providers: [SharedService], exports: [SharedService] })
        export class SharedModule {}
      `,
			"shared.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class SharedService {}
      `,
			"fake.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class FakeService {}
      `,
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedModule } from './shared.module';
        @Module({ imports: [SharedModule] })
        export class AppModule {}
      `,
			"other.module.ts": `
        import { Module } from '@nestjs/common';
        import { SharedService } from './shared.service';
        import { FakeService } from './fake.service';
        @Module({ providers: [{ provide: SharedService, useClass: FakeService }] })
        export class OtherModule {}
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

describe("no-request-scope-abuse", () => {
	it("flags Scope.REQUEST usage", () => {
		const diags = runRule(
			noRequestScopeAbuse,
			`
      import { Injectable, Scope } from '@nestjs/common';
      @Injectable({ scope: Scope.REQUEST })
      export class RequestScopedService {
        doStuff() {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("Scope.REQUEST");
	});

	it("allows Scope.DEFAULT", () => {
		const diags = runRule(
			noRequestScopeAbuse,
			`
      import { Injectable, Scope } from '@nestjs/common';
      @Injectable({ scope: Scope.DEFAULT })
      export class DefaultScopedService {
        doStuff() {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows Scope.TRANSIENT", () => {
		const diags = runRule(
			noRequestScopeAbuse,
			`
      import { Injectable, Scope } from '@nestjs/common';
      @Injectable({ scope: Scope.TRANSIENT })
      export class TransientService {
        doStuff() {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});
