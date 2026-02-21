import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../../../src/engine/module-graph.js";
import { resolveProviders } from "../../../src/engine/type-resolver.js";
import { noAsyncWithoutAwait } from "../../../src/rules/correctness/no-async-without-await.js";
import { noDuplicateModuleMetadata } from "../../../src/rules/correctness/no-duplicate-module-metadata.js";
import { noDuplicateRoutes } from "../../../src/rules/correctness/no-duplicate-routes.js";
import { noEmptyHandlers } from "../../../src/rules/correctness/no-empty-handlers.js";
import { noFireAndForgetAsync } from "../../../src/rules/correctness/no-fire-and-forget-async.js";
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

	it("allows same route with different @Version decorators", () => {
		const diags = runRule(
			noDuplicateRoutes,
			`
      import { Controller, Get, Version } from '@nestjs/common';
      @Controller('apps')
      export class AppsController {
        @Get(':appNumber')
        @Version('1')
        findV1() { return {}; }
        @Get(':appNumber')
        @Version('2')
        findV2() { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags duplicate routes with the same @Version", () => {
		const diags = runRule(
			noDuplicateRoutes,
			`
      import { Controller, Get, Version } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get(':id')
        @Version('1')
        findOne() { return {}; }
        @Get(':id')
        @Version('1')
        findOneDuplicate() { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("allows same route when one is versioned and one is not", () => {
		const diags = runRule(
			noDuplicateRoutes,
			`
      import { Controller, Get, Version } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get(':id')
        findOne() { return {}; }
        @Get(':id')
        @Version('2')
        findOneV2() { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows same route with array version vs single version", () => {
		const diags = runRule(
			noDuplicateRoutes,
			`
      import { Controller, Get, Version } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get(':id')
        @Version(['1', '2'])
        findOneV1V2() { return {}; }
        @Get(':id')
        @Version('3')
        findOneV3() { return {}; }
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

	it("skips guard extending a base class", () => {
		const diags = runRule(
			noMissingGuardMethod,
			`
      import { Injectable } from '@nestjs/common';
      import { AuthGuard } from '@nestjs/passport';
      @Injectable()
      export class AuthorizationGuard extends AuthGuard(['jwt']) {}
    `
		);
		expect(diags).toHaveLength(0);
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

	it("skips pipe extending a base class", () => {
		const diags = runRule(
			noMissingPipeMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class CustomPipe extends BasePipe {}
    `
		);
		expect(diags).toHaveLength(0);
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

	it("skips filter extending a base class", () => {
		const diags = runRule(
			noMissingFilterCatch,
			`
      import { Catch } from '@nestjs/common';
      import { BaseExceptionFilter } from '@nestjs/core';
      @Catch()
      export class CustomFilter extends BaseExceptionFilter {}
    `
		);
		expect(diags).toHaveLength(0);
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

	it("skips interceptor extending a base class", () => {
		const diags = runRule(
			noMissingInterceptorMethod,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class CustomInterceptor extends BaseInterceptor {}
    `
		);
		expect(diags).toHaveLength(0);
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

	it("shows specific message when returning new Promise", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      export class MyService {
        async validateToken() {
          return new Promise((resolve) => {
            resolve(true);
          });
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("returns a Promise directly");
	});

	it("shows generic message when not returning a Promise", () => {
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
		expect(diags[0].message).toContain("has no await expression");
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

	it("does not flag controller HTTP handler methods", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        async findAll() {
          return this.usersService.findAll();
        }
        @Get()
        async findOne() {
          return this.usersService.findOne();
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("findAll");
	});

	it("still flags non-handler methods in controllers", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        async helperMethod() {
          return 42;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("helperMethod");
	});

	it("does not flag methods with @TsRestHandler decorator", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      import { Controller } from '@nestjs/common';
      @Controller()
      export class AppController {
        @TsRestHandler(contract)
        async handler() {
          return tsRestHandler(contract, {});
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag methods with @GrpcMethod decorator", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      import { Controller } from '@nestjs/common';
      @Controller()
      export class HeroController {
        @GrpcMethod('HeroService', 'FindOne')
        async findOne(data: { id: number }) {
          return { id: 1, name: 'Hero' };
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag methods with @GrpcStreamMethod decorator", () => {
		const diags = runRule(
			noAsyncWithoutAwait,
			`
      import { Controller } from '@nestjs/common';
      @Controller()
      export class HeroController {
        @GrpcStreamMethod('HeroService', 'FindMany')
        async findMany() {
          return new Subject();
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
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

describe("no-fire-and-forget-async", () => {
	it("flags unawaited async-like calls in service methods", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OrdersService {
        processOrder() {
          this.emailService.sendConfirmation();
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("sendConfirmation");
	});

	it("allows awaited calls", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OrdersService {
        async processOrder() {
          await this.emailService.sendConfirmation();
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows void-prefixed calls (intentional fire-and-forget)", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OrdersService {
        processOrder() {
          void this.emailService.sendConfirmation();
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("skips HTTP handler methods", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Controller, Post } from '@nestjs/common';
      @Controller('orders')
      export class OrdersController {
        @Post()
        create() {
          this.ordersService.save();
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-async-named method calls", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OrdersService {
        processOrder() {
          this.logger.log('processing');
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag calls assigned to a variable", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OrdersService {
        processOrder() {
          const result = this.repo.save(order);
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});
