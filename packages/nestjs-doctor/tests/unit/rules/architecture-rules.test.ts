import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { noBarrelExportInternals } from "../../../src/rules/architecture/no-barrel-export-internals.js";
import { noBusinessLogicInControllers } from "../../../src/rules/architecture/no-business-logic-in-controllers.js";
import { noManualInstantiation } from "../../../src/rules/architecture/no-manual-instantiation.js";
import { noOrmInControllers } from "../../../src/rules/architecture/no-orm-in-controllers.js";
import { noOrmInServices } from "../../../src/rules/architecture/no-orm-in-services.js";
import { noServiceLocator } from "../../../src/rules/architecture/no-service-locator.js";
import { preferConstructorInjection } from "../../../src/rules/architecture/prefer-constructor-injection.js";
import { preferInterfaceInjection } from "../../../src/rules/architecture/prefer-interface-injection.js";
import { requireModuleBoundaries } from "../../../src/rules/architecture/require-module-boundaries.js";
import type { Rule } from "../../../src/rules/types.js";
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

describe("no-business-logic-in-controllers", () => {
	it("flags controllers with loops in handlers", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        findAll() {
          const items = [];
          for (const x of [1, 2, 3]) {
            items.push(x);
          }
          return items;
        }
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("business logic");
	});

	it("flags controllers with multiple if statements", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        findAll() {
          if (true) { }
          if (false) { }
          if (true) { }
          return [];
        }
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("allows simple guard clauses (single if)", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        findAll() {
          if (!this.auth) throw new Error('Unauthorized');
          return this.service.findAll();
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-controller classes", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        findAll() {
          for (const x of [1, 2, 3]) {}
          if (true) {}
          if (false) {}
          return [];
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-orm-in-controllers", () => {
	it("flags PrismaService injection in controllers", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        constructor(private readonly prisma: PrismaService) {}
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("PrismaService");
	});

	it("flags EntityManager injection", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        constructor(private readonly em: EntityManager) {}
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("does not flag regular service injection", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        constructor(private readonly usersService: UsersService) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-orm-in-services", () => {
	it("flags PrismaService injection in services", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(private readonly prisma: PrismaService) {}
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("skips classes named *Repository", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersRepository {
        constructor(private readonly prisma: PrismaService) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-manual-instantiation", () => {
	it("flags new SomeService()", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      const svc = new UserService();
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UserService");
	});

	it("flags new SomeRepository()", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      const repo = new UsersRepository();
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("does not flag new Date() or new Map()", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      const d = new Date();
      const m = new Map();
      const s = new Set();
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Pipe in decorator argument", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      import { Controller, UsePipes, Query } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @UsePipes(new ValidationPipe({ transform: true }))
        findAll(@Query(new QueryParamsPipe()) query: any) {
          return [];
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Guard in @UseGuards decorator", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      import { Controller, UseGuards } from '@nestjs/common';
      @Controller('users')
      @UseGuards(new AuthGuard('jwt'))
      export class UsersController {}
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Filter in @UseFilters decorator", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      import { Controller, UseFilters } from '@nestjs/common';
      @Controller('users')
      @UseFilters(new HttpExceptionFilter())
      export class UsersController {}
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Interceptor in @UseInterceptors decorator", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      import { Controller, UseInterceptors } from '@nestjs/common';
      @Controller('users')
      @UseInterceptors(new LoggingInterceptor())
      export class UsersController {}
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Pipe at top-level scope", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      export const GlobalValidationPipe = new ValidationPipe({
        whitelist: true,
        transform: true,
      });
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags Pipe inside a method body", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class SomeService {
        doStuff() {
          const pipe = new ValidationPipe();
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("ValidationPipe");
	});

	it("flags Guard inside a constructor body", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class SomeService {
        constructor() {
          this.guard = new AuthGuard();
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("AuthGuard");
	});

	it("still flags Service/Repository regardless of context", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      export const svc = new UserService();
      const repo = new UsersRepository();
    `
		);
		expect(diags).toHaveLength(2);
	});
});

describe("prefer-constructor-injection", () => {
	it("flags @Inject() property injection", () => {
		const diags = runRule(
			preferConstructorInjection,
			`
      import { Injectable, Inject } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        @Inject()
        private logger: any;
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("logger");
	});

	it("does not flag constructor injection", () => {
		const diags = runRule(
			preferConstructorInjection,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(private readonly logger: any) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("prefer-interface-injection", () => {
	it("flags concrete service-to-service injection", () => {
		const diags = runRule(
			preferInterfaceInjection,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OrdersService {
        constructor(private readonly usersService: UsersService) {}
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("UsersService");
	});

	it("does not flag abstract class injection", () => {
		const diags = runRule(
			preferInterfaceInjection,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OrdersService {
        constructor(private readonly usersService: AbstractUsersService) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("require-module-boundaries", () => {
	it("flags deep imports crossing module boundaries", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { UsersRepository } from '../users/repositories/users.repository';
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("internals");
	});

	it("does not flag local relative imports", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { UsersService } from './users.service';
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag package imports", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { Injectable } from '@nestjs/common';
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-barrel-export-internals", () => {
	it("flags re-exporting repositories from barrel files", () => {
		const diags = runRule(
			noBarrelExportInternals,
			`
      export { UsersRepository } from './users.repository';
      export { UsersService } from './users.service';
    `,
			"src/users/index.ts"
		);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("does not flag in non-barrel files", () => {
		const diags = runRule(
			noBarrelExportInternals,
			`
      export { UsersRepository } from './users.repository';
    `,
			"src/users/module.ts"
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-service-locator", () => {
	it("flags this.moduleRef.get()", () => {
		const diags = runRule(
			noServiceLocator,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor(private readonly moduleRef: ModuleRef) {}
        getService() {
          return this.moduleRef.get(OtherService);
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("Service locator");
	});

	it("flags this.moduleRef.resolve()", () => {
		const diags = runRule(
			noServiceLocator,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor(private readonly moduleRef: ModuleRef) {}
        async getService() {
          return await this.moduleRef.resolve(OtherService);
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("Service locator");
	});

	it("does not flag regular method calls", () => {
		const diags = runRule(
			noServiceLocator,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MyService {
        constructor(private readonly configService: ConfigService) {}
        getValue() {
          return this.configService.get('KEY');
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags bare moduleRef.get() without this", () => {
		const diags = runRule(
			noServiceLocator,
			`
      async function bootstrap(moduleRef: any) {
        const svc = moduleRef.get(AppService);
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("moduleRef.get()");
	});
});
