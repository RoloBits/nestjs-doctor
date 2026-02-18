import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../../../src/engine/module-graph.js";
import { resolveProviders } from "../../../src/engine/type-resolver.js";
import { noAsyncWithoutAwait } from "../../../src/rules/correctness/no-async-without-await.js";
import { noDuplicateModuleMetadata } from "../../../src/rules/correctness/no-duplicate-module-metadata.js";
import { noDuplicateRoutes } from "../../../src/rules/correctness/no-duplicate-routes.js";
import { noEmptyHandlers } from "../../../src/rules/correctness/no-empty-handlers.js";
import { noMissingFilterCatch } from "../../../src/rules/correctness/no-missing-filter-catch.js";
import { noMissingGuardMethod } from "../../../src/rules/correctness/no-missing-guard-method.js";
import { noMissingInjectable } from "../../../src/rules/correctness/no-missing-injectable.js";
import { noMissingInterceptorMethod } from "../../../src/rules/correctness/no-missing-interceptor-method.js";
import { noMissingModuleDecorator } from "../../../src/rules/correctness/no-missing-module-decorator.js";
import { noMissingPipeMethod } from "../../../src/rules/correctness/no-missing-pipe-method.js";
import { requireInjectDecorator } from "../../../src/rules/correctness/require-inject-decorator.js";
import { requireLifecycleInterface } from "../../../src/rules/correctness/require-lifecycle-interface.js";
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

describe("require-lifecycle-interface", () => {
	it("flags class with onModuleInit but no implements", () => {
		const diags = runRule(
			requireLifecycleInterface,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MyService {
        onModuleInit() {
          console.log('init');
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("OnModuleInit");
	});

	it("allows class that implements the interface", () => {
		const diags = runRule(
			requireLifecycleInterface,
			`
      import { Injectable, OnModuleInit } from '@nestjs/common';
      @Injectable()
      export class MyService implements OnModuleInit {
        onModuleInit() {
          console.log('init');
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags onModuleDestroy without OnModuleDestroy", () => {
		const diags = runRule(
			requireLifecycleInterface,
			`
      export class MyService {
        onModuleDestroy() {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("OnModuleDestroy");
	});
});

describe("no-missing-injectable", () => {
	it("flags provider listed in module without @Injectable", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [MyService] })
        export class AppModule {}
      `,
			"my.service.ts": `
        export class MyService {
          doStuff() {}
        }
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("MyService");
	});

	it("allows provider with @Injectable", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [MyService] })
        export class AppModule {}
      `,
			"my.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class MyService {
          doStuff() {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});
});

describe("no-empty-handlers", () => {
	it("flags empty handler body", () => {
		const diags = runRule(
			noEmptyHandlers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        findAll() {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("findAll");
	});

	it("allows handler with body", () => {
		const diags = runRule(
			noEmptyHandlers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        findAll() {
          return [];
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-handler methods", () => {
		const diags = runRule(
			noEmptyHandlers,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        helperMethod() {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-duplicate-routes", () => {
	it("flags duplicate GET routes", () => {
		const diags = runRule(
			noDuplicateRoutes,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get('list')
        findAll() { return []; }
        @Get('list')
        findAllV2() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("Duplicate");
	});

	it("allows different paths", () => {
		const diags = runRule(
			noDuplicateRoutes,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get('list')
        findAll() { return []; }
        @Get(':id')
        findOne() { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows same path with different methods", () => {
		const diags = runRule(
			noDuplicateRoutes,
			`
      import { Controller, Get, Post } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        findAll() { return []; }
        @Post()
        create() { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-missing-guard-method", () => {
	it("flags guard without canActivate", () => {
		const diags = runRule(
			noMissingGuardMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class AuthGuard {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("canActivate");
	});

	it("allows guard with canActivate", () => {
		const diags = runRule(
			noMissingGuardMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class AuthGuard {
        canActivate(context: any) { return true; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-missing-pipe-method", () => {
	it("flags pipe without transform", () => {
		const diags = runRule(
			noMissingPipeMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class ParseIntPipe {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("transform");
	});

	it("allows pipe with transform", () => {
		const diags = runRule(
			noMissingPipeMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class ParseIntPipe {
        transform(value: any) { return parseInt(value); }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-missing-filter-catch", () => {
	it("flags @Catch without catch method", () => {
		const diags = runRule(
			noMissingFilterCatch,
			`
      import { Catch } from '@nestjs/common';
      @Catch()
      export class HttpExceptionFilter {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("catch");
	});

	it("allows @Catch with catch method", () => {
		const diags = runRule(
			noMissingFilterCatch,
			`
      import { Catch } from '@nestjs/common';
      @Catch()
      export class HttpExceptionFilter {
        catch(exception: any, host: any) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-missing-interceptor-method", () => {
	it("flags interceptor without intercept", () => {
		const diags = runRule(
			noMissingInterceptorMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class LoggingInterceptor {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("intercept");
	});

	it("allows interceptor with intercept", () => {
		const diags = runRule(
			noMissingInterceptorMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class LoggingInterceptor {
        intercept(context: any, next: any) { return next.handle(); }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-async-without-await", () => {
	it("flags async method without await", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      export class MyService {
        async doStuff() {
          return 42;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("doStuff");
	});

	it("allows async method with await", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      export class MyService {
        async doStuff() {
          const result = await somePromise();
          return result;
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags async function without await", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      async function doStuff() {
        return 42;
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("ignores await in nested arrow function", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      export class MyService {
        async doStuff() {
          const fn = async () => await something();
          return fn;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});
});

describe("no-duplicate-module-metadata", () => {
	it("flags duplicate providers", () => {
		const diags = runRule(
			noDuplicateModuleMetadata,
			`
      import { Module } from '@nestjs/common';
      @Module({ providers: [UserService, UserService] })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UserService");
	});

	it("allows unique providers", () => {
		const diags = runRule(
			noDuplicateModuleMetadata,
			`
      import { Module } from '@nestjs/common';
      @Module({ providers: [UserService, OrderService] })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags duplicate imports", () => {
		const diags = runRule(
			noDuplicateModuleMetadata,
			`
      import { Module } from '@nestjs/common';
      @Module({ imports: [UsersModule, UsersModule] })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(1);
	});
});

describe("no-missing-module-decorator", () => {
	it("flags class named *Module without @Module", () => {
		const diags = runRule(
			noMissingModuleDecorator,
			`
      export class UsersModule {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UsersModule");
	});

	it("allows class with @Module", () => {
		const diags = runRule(
			noMissingModuleDecorator,
			`
      import { Module } from '@nestjs/common';
      @Module({})
      export class UsersModule {}
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-module classes", () => {
		const diags = runRule(
			noMissingModuleDecorator,
			`
      export class UsersService {}
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("require-inject-decorator", () => {
	it("flags untyped constructor param without @Inject", () => {
		const diags = runRule(
			requireInjectDecorator,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor(dep) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("dep");
	});

	it("allows typed constructor param", () => {
		const diags = runRule(
			requireInjectDecorator,
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

	it("allows untyped param with @Inject", () => {
		const diags = runRule(
			requireInjectDecorator,
			`
      import { Injectable, Inject } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor(@Inject('TOKEN') dep) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});
