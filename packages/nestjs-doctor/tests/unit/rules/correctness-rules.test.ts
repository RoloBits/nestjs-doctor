import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { NestjsDoctorConfig } from "../../../src/common/config.js";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { buildModuleGraph } from "../../../src/engine/graph/module-graph.js";
import { resolveProviders } from "../../../src/engine/graph/type-resolver.js";
import { factoryInjectMatchesParams } from "../../../src/engine/rules/definitions/correctness/factory-inject-matches-params.js";
import { injectableMustBeProvided } from "../../../src/engine/rules/definitions/correctness/injectable-must-be-provided.js";
import { noAsyncWithoutAwait } from "../../../src/engine/rules/definitions/correctness/no-async-without-await.js";
import { noDuplicateDecorators } from "../../../src/engine/rules/definitions/correctness/no-duplicate-decorators.js";
import { noDuplicateModuleMetadata } from "../../../src/engine/rules/definitions/correctness/no-duplicate-module-metadata.js";
import { noDuplicateRoutes } from "../../../src/engine/rules/definitions/correctness/no-duplicate-routes.js";
import { noEmptyHandlers } from "../../../src/engine/rules/definitions/correctness/no-empty-handlers.js";
import { noFireAndForgetAsync } from "../../../src/engine/rules/definitions/correctness/no-fire-and-forget-async.js";
import { noMissingFilterCatch } from "../../../src/engine/rules/definitions/correctness/no-missing-filter-catch.js";
import { noMissingGuardMethod } from "../../../src/engine/rules/definitions/correctness/no-missing-guard-method.js";
import { noMissingInjectable } from "../../../src/engine/rules/definitions/correctness/no-missing-injectable.js";
import { noMissingInterceptorMethod } from "../../../src/engine/rules/definitions/correctness/no-missing-interceptor-method.js";
import { noMissingModuleDecorator } from "../../../src/engine/rules/definitions/correctness/no-missing-module-decorator.js";
import { noMissingPipeMethod } from "../../../src/engine/rules/definitions/correctness/no-missing-pipe-method.js";
import { paramDecoratorMatchesRoute } from "../../../src/engine/rules/definitions/correctness/param-decorator-matches-route.js";
import { requireInjectDecorator } from "../../../src/engine/rules/definitions/correctness/require-inject-decorator.js";
import { requireLifecycleInterface } from "../../../src/engine/rules/definitions/correctness/require-lifecycle-interface.js";
import { validateNestedArrayEach } from "../../../src/engine/rules/definitions/correctness/validate-nested-array-each.js";
import { validatedNonPrimitiveNeedsType } from "../../../src/engine/rules/definitions/correctness/validated-non-primitive-needs-type.js";
import type { ProjectRule, Rule } from "../../../src/engine/rules/types.js";

function runRule(
	rule: Rule,
	code: string,
	filePath = "test.ts",
	options?: { useRealFs?: boolean }
): Diagnostic[] {
	const useRealFs = options?.useRealFs ?? false;
	const project = useRealFs
		? new Project({ compilerOptions: { strict: true } })
		: new Project({ useInMemoryFileSystem: true });
	const actualPath = useRealFs
		? `/tmp/nestjs-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`
		: filePath;
	const sourceFile = project.createSourceFile(actualPath, code, {
		overwrite: true,
	});
	const diagnostics: Diagnostic[] = [];

	rule.check({
		sourceFile,
		filePath: actualPath,
		report(partial) {
			diagnostics.push({
				...partial,
				rule: rule.meta.id,
				category: rule.meta.category,
				severity: rule.meta.severity,
			});
		},
	});

	if (useRealFs) {
		project.getSourceFile(actualPath)?.deleteImmediatelySync();
	}

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

	it("does not match interface names that only contain the lifecycle name as a substring", () => {
		const diags = runRule(
			requireLifecycleInterface,
			`
      interface NotOnModuleInit { init(): void; }
      export class MyService implements NotOnModuleInit {
        onModuleInit() {}
        init() {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("OnModuleInit");
	});
});

describe("no-missing-injectable", () => {
	it("flags provider with constructor dependencies listed in module without @Injectable", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [MyService] })
        export class AppModule {}
      `,
			"my.service.ts": `
        export class MyService {
          constructor(private readonly dep: OtherService) {}
        }
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("MyService");
	});

	it("does not flag a CQRS handler, whose decorator emits the metadata", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [CreatePostHandler] })
        export class AppModule {}
      `,
			"create-post.handler.ts": `
        import { CommandHandler } from '@nestjs/cqrs';
        @CommandHandler(CreatePostCommand)
        export class CreatePostHandler {
          constructor(private readonly repo: PostRepository) {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("does not flag a queue processor", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [TaskConsumer] })
        export class AppModule {}
      `,
			"task.processor.ts": `
        import { Processor } from '@nestjs/bull';
        @Processor('tasks')
        export class TaskConsumer {
          constructor(private readonly tasks: TaskService) {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("still flags a provider whose only decorator is on a method", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [CronRunner] })
        export class AppModule {}
      `,
			"cron.runner.ts": `
        import { Cron } from '@nestjs/schedule';
        export class CronRunner {
          constructor(private readonly dep: OtherService) {}

          @Cron('0 * * * *')
          run() {}
        }
      `,
		});
		expect(diags).toHaveLength(1);
	});

	it("does not flag provider without constructor dependencies", () => {
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
		expect(diags).toHaveLength(0);
	});

	it("does not flag provider with empty constructor (no params)", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [MyService] })
        export class AppModule {}
      `,
			"my.service.ts": `
        export class MyService {
          constructor() {}
        }
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("flags provider with optional constructor dependency", () => {
		const diags = runProjectRule(noMissingInjectable, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [MyService] })
        export class AppModule {}
      `,
			"my.service.ts": `
        export class MyService {
          constructor(private readonly dep?: OtherService) {}
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

	it("does not flag Map.delete() calls", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class CacheService {
        private cache = new Map<string, any>();
        invalidate(key: string) {
          this.cache.delete(key);
        }
      }
    `,
			"test.ts",
			{ useRealFs: true }
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Set.delete() calls", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class TagService {
        private tags = new Set<string>();
        removeTag(tag: string) {
          this.tags.delete(tag);
        }
      }
    `,
			"test.ts",
			{ useRealFs: true }
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Array.sort() or other sync built-in methods", () => {
		const diags = runRule(
			noFireAndForgetAsync,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class ListService {
        private items: string[] = [];
        processItems() {
          this.items.sort();
        }
      }
    `,
			"test.ts",
			{ useRealFs: true }
		);
		expect(diags).toHaveLength(0);
	});
});

describe("param-decorator-matches-route", () => {
	it("flags @Param name not in route path", () => {
		const diags = runRule(
			paramDecoratorMatchesRoute,
			`
      import { Controller, Get, Param } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get(':id')
        findOne(@Param('userId') userId: string) { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("userId");
	});

	it("allows @Param name matching route param", () => {
		const diags = runRule(
			paramDecoratorMatchesRoute,
			`
      import { Controller, Get, Param } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get(':id')
        findOne(@Param('id') id: string) { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows @Param() without arguments", () => {
		const diags = runRule(
			paramDecoratorMatchesRoute,
			`
      import { Controller, Get, Param } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get(':id')
        findOne(@Param() params: any) { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("checks controller-level route params", () => {
		const diags = runRule(
			paramDecoratorMatchesRoute,
			`
      import { Controller, Get, Param } from '@nestjs/common';
      @Controller('users/:userId')
      export class UsersController {
        @Get('posts')
        getPosts(@Param('userId') userId: string) { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags param not in controller or method route", () => {
		const diags = runRule(
			paramDecoratorMatchesRoute,
			`
      import { Controller, Get, Param } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get('posts')
        getPosts(@Param('id') id: string) { return []; }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("does not extract false params from non-path properties in @Controller object", () => {
		const diags = runRule(
			paramDecoratorMatchesRoute,
			`
      import { Controller, Get, Param } from '@nestjs/common';
      @Controller({ path: 'users', host: ':subdomain.example.com' })
      export class UsersController {
        @Get(':id')
        findOne(@Param('subdomain') sub: string) { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(1); // Should flag — subdomain is in host, not path
	});
});

describe("factory-inject-matches-params", () => {
	it("flags inject/factory parameter count mismatch", () => {
		const diags = runRule(
			factoryInjectMatchesParams,
			`
      import { Module } from '@nestjs/common';
      @Module({
        providers: [
          {
            provide: 'TOKEN',
            useFactory: (configService) => configService.get('key'),
            inject: [ConfigService, LoggerService],
          },
        ],
      })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("1 parameter(s)");
		expect(diags[0].message).toContain("2 element(s)");
	});

	it("allows matching inject/factory parameter count", () => {
		const diags = runRule(
			factoryInjectMatchesParams,
			`
      import { Module } from '@nestjs/common';
      @Module({
        providers: [
          {
            provide: 'TOKEN',
            useFactory: (config, logger) => config.get('key'),
            inject: [ConfigService, LoggerService],
          },
        ],
      })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("handles function expression factories", () => {
		const diags = runRule(
			factoryInjectMatchesParams,
			`
      import { Module } from '@nestjs/common';
      @Module({
        providers: [
          {
            provide: 'TOKEN',
            useFactory: function(a, b, c) { return a; },
            inject: [A, B],
          },
        ],
      })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("handles method shorthand factories", () => {
		const diags = runRule(
			factoryInjectMatchesParams,
			`
      import { Module } from '@nestjs/common';
      @Module({
        providers: [
          {
            provide: 'TOKEN',
            useFactory(a, b, c) { return a; },
            inject: [A, B],
          },
        ],
      })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("3 parameter(s)");
		expect(diags[0].message).toContain("2 element(s)");
	});

	it("allows matching method shorthand factories", () => {
		const diags = runRule(
			factoryInjectMatchesParams,
			`
      import { Module } from '@nestjs/common';
      @Module({
        providers: [
          {
            provide: 'TOKEN',
            useFactory(a, b) { return a; },
            inject: [A, B],
          },
        ],
      })
      export class AppModule {}
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("validated-non-primitive-needs-type", () => {
	it("flags non-primitive property with validator but no @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { ValidateNested } from 'class-validator';
      class AddressDto { street: string; }
      class CreateUserDto {
        @ValidateNested()
        address: AddressDto;
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("address");
		expect(diags[0].message).toContain("AddressDto");
	});

	it("allows non-primitive property with @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { ValidateNested } from 'class-validator';
      import { Type } from 'class-transformer';
      class AddressDto { street: string; }
      class CreateUserDto {
        @ValidateNested()
        @Type(() => AddressDto)
        address: AddressDto;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows primitive properties without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsString, IsNumber } from 'class-validator';
      class CreateUserDto {
        @IsString()
        name: string;
        @IsNumber()
        age: number;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("skips properties without type annotation", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsNotEmpty } from 'class-validator';
      class CreateUserDto {
        @IsNotEmpty()
        name;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows Date type without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsDate } from 'class-validator';
      class CreateEventDto {
        @IsDate()
        startDate: Date;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows nullable primitive union types without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsString, IsOptional } from 'class-validator';
      class UpdateUserDto {
        @IsString()
        @IsOptional()
        name: string | null;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows undefined primitive union types without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsNumber, IsOptional } from 'class-validator';
      class UpdateUserDto {
        @IsNumber()
        @IsOptional()
        age: number | undefined;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags non-primitive union types without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { ValidateNested } from 'class-validator';
      class AddressDto { street: string; }
      class CreateUserDto {
        @ValidateNested()
        address: AddressDto | undefined;
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("address");
	});

	it("allows string[][] without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsArray } from 'class-validator';
      class MatrixDto {
        @IsArray()
        grid: string[][];
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows Array<Array<number>> without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsArray } from 'class-validator';
      class MatrixDto {
        @IsArray()
        grid: Array<Array<number>>;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows enum property with @IsEnum() without @Type()", () => {
		const diags = runRule(
			validatedNonPrimitiveNeedsType,
			`
      import { IsEnum } from 'class-validator';
      enum Status { Active = 'active', Inactive = 'inactive' }
      class UpdateDto {
        @IsEnum(Status)
        status: Status;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-duplicate-decorators", () => {
	it("flags duplicate decorator on a method", () => {
		const diags = runRule(
			noDuplicateDecorators,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        @Get()
        findAll() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("@Get()");
	});

	it("allows different decorators on same method", () => {
		const diags = runRule(
			noDuplicateDecorators,
			`
      import { Controller, Get, UseGuards } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        @UseGuards(AuthGuard)
        findAll() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows stackable decorators like @ApiResponse", () => {
		const diags = runRule(
			noDuplicateDecorators,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        @ApiResponse({ status: 200 })
        @ApiResponse({ status: 404 })
        findAll() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags duplicate decorator on a class", () => {
		const diags = runRule(
			noDuplicateDecorators,
			`
      @Controller('users')
      @Controller('admin')
      export class UsersController {}
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("@Controller()");
	});

	it("flags duplicate decorator on a property", () => {
		const diags = runRule(
			noDuplicateDecorators,
			`
      class CreateUserDto {
        @IsString()
        @IsString()
        name: string;
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("flags duplicate decorator on a constructor parameter", () => {
		const diags = runRule(
			noDuplicateDecorators,
			`
      import { Injectable, Inject } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor(
          @Inject('TOKEN') @Inject('TOKEN') private dep: any
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("@Inject()");
	});

	it("allows stackable @Throttle() decorators", () => {
		const diags = runRule(
			noDuplicateDecorators,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Throttle({ default: { limit: 3, ttl: 60 } })
        @Throttle({ short: { limit: 1, ttl: 10 } })
        @Get()
        findAll() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("validate-nested-array-each", () => {
	it("flags @ValidateNested() on array without { each: true }", () => {
		const diags = runRule(
			validateNestedArrayEach,
			`
      import { ValidateNested } from 'class-validator';
      class ItemDto { name: string; }
      class OrderDto {
        @ValidateNested()
        items: ItemDto[];
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("items");
	});

	it("allows @ValidateNested({ each: true }) on array", () => {
		const diags = runRule(
			validateNestedArrayEach,
			`
      import { ValidateNested } from 'class-validator';
      class ItemDto { name: string; }
      class OrderDto {
        @ValidateNested({ each: true })
        items: ItemDto[];
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows @ValidateNested() on non-array type", () => {
		const diags = runRule(
			validateNestedArrayEach,
			`
      import { ValidateNested } from 'class-validator';
      class AddressDto { street: string; }
      class UserDto {
        @ValidateNested()
        address: AddressDto;
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("detects array type via @IsArray decorator", () => {
		const diags = runRule(
			validateNestedArrayEach,
			`
      import { ValidateNested, IsArray } from 'class-validator';
      class ItemDto { name: string; }
      class OrderDto {
        @IsArray()
        @ValidateNested()
        items: ItemDto;
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("detects Array<T> generic syntax", () => {
		const diags = runRule(
			validateNestedArrayEach,
			`
      import { ValidateNested } from 'class-validator';
      class ItemDto { name: string; }
      class OrderDto {
        @ValidateNested()
        items: Array<ItemDto>;
      }
    `
		);
		expect(diags).toHaveLength(1);
	});
});

describe("injectable-must-be-provided", () => {
	it("flags @Injectable() class not in any module providers", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [OtherService] })
        export class AppModule {}
      `,
			"my.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class MyService {}
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("MyService");
	});

	it("allows @Injectable() class registered in module providers", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [MyService] })
        export class AppModule {}
      `,
			"my.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class MyService {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("skips classes with Guard/Interceptor/Pipe/Filter suffixes", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [] })
        export class AppModule {}
      `,
			"auth.guard.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class AuthGuard {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("skips test files", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [] })
        export class AppModule {}
      `,
			"my.service.spec.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class MockService {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("allows @Injectable() class registered via useClass in a custom provider", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          providers: [
            { provide: 'MY_SERVICE', useClass: MyService },
          ],
        })
        export class AppModule {}
      `,
			"my.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class MyService {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("allows @Injectable() class registered via useExisting in a custom provider", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({
          providers: [
            MyService,
            { provide: 'ALIAS', useExisting: MyService },
          ],
        })
        export class AppModule {}
      `,
			"my.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class MyService {}
      `,
		});
		expect(diags).toHaveLength(0);
	});

	it("flags @Injectable() service with generic 'Task' suffix not registered in any module", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [] })
        export class AppModule {}
      `,
			"background-task.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class BackgroundTask {}
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("BackgroundTask");
	});

	it("flags @Injectable() service with generic 'Indicator' suffix not registered in any module", () => {
		const diags = runProjectRule(injectableMustBeProvided, {
			"app.module.ts": `
        import { Module } from '@nestjs/common';
        @Module({ providers: [] })
        export class AppModule {}
      `,
			"performance-indicator.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class PerformanceIndicator {}
      `,
		});
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("PerformanceIndicator");
	});
});
