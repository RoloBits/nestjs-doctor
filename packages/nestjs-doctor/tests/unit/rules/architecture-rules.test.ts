import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { NestjsDoctorConfig } from "../../../src/common/config.js";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { noBarrelExportInternals } from "../../../src/engine/rules/definitions/architecture/no-barrel-export-internals.js";
import { noBusinessLogicInControllers } from "../../../src/engine/rules/definitions/architecture/no-business-logic-in-controllers.js";
import { noManualInstantiation } from "../../../src/engine/rules/definitions/architecture/no-manual-instantiation.js";
import { noOrmInControllers } from "../../../src/engine/rules/definitions/architecture/no-orm-in-controllers.js";
import { noOrmInServices } from "../../../src/engine/rules/definitions/architecture/no-orm-in-services.js";
import { noServiceLocator } from "../../../src/engine/rules/definitions/architecture/no-service-locator.js";
import { preferConstructorInjection } from "../../../src/engine/rules/definitions/architecture/prefer-constructor-injection.js";
import { requireModuleBoundaries } from "../../../src/engine/rules/definitions/architecture/require-module-boundaries.js";
import type { Rule } from "../../../src/engine/rules/types.js";

function runRule(
	rule: Rule,
	code: string,
	filePath = "test.ts",
	config: NestjsDoctorConfig = {},
	moduleDirectories?: ReadonlySet<string>,
	diProviders?: ReadonlySet<string>,
	alsoPresent: string[] = []
): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	for (const present of alsoPresent) {
		project.createSourceFile(present, "export {};");
	}
	const sourceFile = project.createSourceFile(filePath, code);
	const diagnostics: Diagnostic[] = [];

	rule.check({
		config,
		diProviders,
		moduleDirectories,
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
	it("examines a class whose @Controller() is behind a composed decorator", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Get } from '@nestjs/common';
      import { ApiController } from './api-controller.decorator';
      @ApiController('items')
      export class ItemsController {
        @Get()
        list(type: string) {
          switch (type) {
            case 'a': return 1;
            default: return 2;
          }
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("examines a base class that declares handlers without @Controller()", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Get } from '@nestjs/common';
      export class DomainControllerBase {
        @Get()
        list(type: string) {
          switch (type) {
            case 'a': return 1;
            default: return 2;
          }
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("leaves a decorated class with no route handler alone", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class ItemsService {
        list(type: string) {
          switch (type) {
            case 'a': return 1;
            default: return 2;
          }
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not count guard clauses that only throw", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('items')
      export class ItemsController {
        @Get(':id')
        async find(id: string) {
          if (!id) {
            throw new BadRequestException('id required');
          }
          const item = await this.service.find(id);
          if (!item) {
            throw new NotFoundException();
          }
          return item;
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags two branching ifs", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('items')
      export class ItemsController {
        @Get(':id')
        async find(id: string) {
          let result = null;
          if (id === 'a') {
            result = 1;
          }
          if (id === 'b') {
            result = 2;
          }
          return result;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("2 if");
	});

	it("does not count an if/else chain whose every branch throws", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('bills')
      export class BillsController {
        @Get(':id')
        async find(id: string) {
          try {
            return await this.service.find(id);
          } catch (e) {
            if (e instanceof NotFoundError) {
              throw new NotFoundException('Not found');
            } else if (e instanceof Error) {
              throw new BadRequestException(e.message);
            } else {
              throw new BadRequestException('Server error');
            }
          }
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not count a braced else that holds only a throwing chain", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('bills')
      export class BillsController {
        @Get(':id')
        async find(id: string) {
          if (!id) {
            throw new BadRequestException();
          } else {
            if (id === 'x') {
              throw new NotFoundException();
            } else {
              throw new BadRequestException();
            }
          }
          if (id === 'y') {
            this.rate = 5;
          }
          return this.service.find(id);
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("counts a chain once however many links it has", () => {
		const twoLinks = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('bills')
      export class BillsController {
        @Get(':id')
        async find(id: string, kind: string) {
          if (kind === 'a') {
            throw new BadRequestException();
          } else {
            this.rate = 5;
          }
          return this.service.find(id);
        }
      }
    `
		);
		const fourLinks = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('bills')
      export class BillsController {
        @Get(':id')
        async find(id: string, kind: string) {
          if (kind === 'a') {
            throw new BadRequestException();
          } else if (kind === 'b') {
            throw new BadRequestException();
          } else if (kind === 'c') {
            throw new BadRequestException();
          } else {
            this.rate = 5;
          }
          return this.service.find(id);
        }
      }
    `
		);
		// Adding rejection branches must not turn one branch into several.
		expect(twoLinks).toHaveLength(0);
		expect(fourLinks).toHaveLength(0);
	});

	it("counts an if/else chain whose last branch does work", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('bills')
      export class BillsController {
        @Get(':id')
        async find(id: string, kind: string) {
          if (!id) {
            throw new BadRequestException();
          }
          if (kind === 'a') {
            throw new BadRequestException();
          } else {
            this.rate = 5;
          }
          if (kind === 'b') {
            this.rate = 10;
          }
          return this.service.find(id);
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("2 if");
	});

	it("counts an if/else as a branch even when it throws", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('items')
      export class ItemsController {
        @Get(':id')
        async find(id: string) {
          if (!id) {
            throw new BadRequestException();
          } else {
            this.log('a');
          }
          if (id === 'x') {
            throw new BadRequestException();
          } else {
            this.log('b');
          }
          return this.service.find(id);
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("2 if");
	});

	it("does not count a guard clause that throws two different exceptions", () => {
		const diags = runRule(
			noBusinessLogicInControllers,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('items')
      export class ItemsController {
        @Get(':id')
        async find(id: string) {
          if (!id) {
            throw new BadRequestException();
          }
          if (!this.user) {
            throw new ForbiddenException();
          }
          if (id === 'x') {
            throw new NotFoundException();
          }
          return this.service.find(id);
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

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

	it("flags MikroORM injection (@mikro-orm/core)", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      import { MikroORM } from '@mikro-orm/core';
      @Controller('users')
      export class UsersController {
        constructor(private readonly orm: MikroORM) {}
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("MikroORM");
	});

	it("flags MikroORM @InjectEntityManager() decorator AND EntityManager type", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      import { InjectEntityManager } from '@mikro-orm/nestjs';
      import { EntityManager } from '@mikro-orm/postgresql';
      @Controller('users')
      export class UsersController {
        constructor(
          @InjectEntityManager()
          private readonly em: EntityManager,
        ) {}
      }
    `
		);
		// Both branches must fire — the type-name set check AND the decorator scan
		expect(diags).toHaveLength(2);
		const messages = diags.map((d) => d.message);
		expect(messages.some((m) => m.includes("EntityManager"))).toBe(true);
		expect(messages.some((m) => m.includes("@InjectEntityManager"))).toBe(true);
	});

	it("flags @InjectEntityManager() even when paired with an unknown type", () => {
		// Isolates the decorator-branch by using a type name not in ORM_TYPES.
		// Guards against a regression that silences the decorator scan.
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      import { InjectEntityManager } from '@mikro-orm/nestjs';
      @Controller('users')
      export class UsersController {
        constructor(
          @InjectEntityManager()
          private readonly em: unknown,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("@InjectEntityManager");
	});

	it("flags DrizzleService injection in controllers", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        constructor(private readonly drizzle: DrizzleService) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("DrizzleService");
	});

	it("flags MongooseModel injection in controllers", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        constructor(private readonly model: MongooseModel) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("MongooseModel");
	});

	it("flags MikroORM EntityRepository<T> injection in a controller", () => {
		const diags = runRule(
			noOrmInControllers,
			`
      import { Controller } from '@nestjs/common';
      import { InjectRepository } from '@mikro-orm/nestjs';
      import { EntityRepository } from '@mikro-orm/core';
      @Controller('users')
      export class UsersController {
        constructor(
          @InjectRepository(User)
          private readonly repo: EntityRepository<User>,
        ) {}
      }
    `
		);
		// Both branches: EntityRepository type + InjectRepository decorator
		expect(diags).toHaveLength(2);
		const messages = diags.map((d) => d.message);
		expect(messages.some((m) => m.includes("EntityRepository"))).toBe(true);
		expect(messages.some((m) => m.includes("@InjectRepository"))).toBe(true);
	});
});

describe("no-orm-in-services", () => {
	it("matches an ORM type through the written annotation", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class OptionsService {
        constructor(private readonly optionsModel: MongooseModel<Option>) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("MongooseModel");
	});

	it("still ignores a service wrapping a repository", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(private readonly users: Repository<User>) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("stays quiet on PrismaService injection — the official Nest recipe", () => {
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
		expect(diags).toHaveLength(0);
	});

	it("stays quiet on PrismaClient injection", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(private readonly prisma: PrismaClient) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags EntityManager injection", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(private readonly em: EntityManager) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("EntityManager");
	});

	it("still flags @InjectRepository() in a service using a TypeORM Repository", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      import { InjectRepository } from '@nestjs/typeorm';
      import { Repository } from 'typeorm';
      @Injectable()
      export class UsersService {
        constructor(
          @InjectRepository(User)
          private readonly users: Repository<User>,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("@InjectRepository");
	});

	it("skips classes named *Repository", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersRepository {
        constructor(private readonly em: EntityManager) {}
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags MikroORM @InjectEntityManager() in services on both branches", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      import { InjectEntityManager } from '@mikro-orm/nestjs';
      import { EntityManager } from '@mikro-orm/postgresql';
      @Injectable()
      export class UsersService {
        constructor(
          @InjectEntityManager()
          private readonly em: EntityManager,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(2);
		const messages = diags.map((d) => d.message);
		expect(messages.some((m) => m.includes("EntityManager"))).toBe(true);
		expect(messages.some((m) => m.includes("@InjectEntityManager"))).toBe(true);
	});

	it("flags DrizzleService injection in services (info severity)", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(private readonly drizzle: DrizzleService) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("DrizzleService");
	});

	it("flags MongooseModel injection in services (info severity)", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(private readonly model: MongooseModel) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("MongooseModel");
	});

	it("flags only the @InjectRepository decorator (NOT the EntityRepository type) in services", () => {
		// MikroORM's EntityRepository<T> is the typed-repo wrapper, the direct
		// analogue of TypeORM's Repository<T>. Both are intentionally excluded
		// from the service ORM_TYPES set because services can legitimately wrap
		// a repository. Only the @InjectRepository decorator path fires —
		// confirming services that follow @mikro-orm/nestjs's canonical pattern
		// are not double-flagged.
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      import { InjectRepository } from '@mikro-orm/nestjs';
      import { EntityRepository } from '@mikro-orm/core';
      @Injectable()
      export class UsersService {
        constructor(
          @InjectRepository(User)
          private readonly repo: EntityRepository<User>,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("@InjectRepository");
	});

	it("flags MikroORM injection in services", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      import { MikroORM } from '@mikro-orm/core';
      @Injectable()
      export class BootstrapService {
        constructor(private readonly orm: MikroORM) {}
      }
    `
		);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags[0].message).toContain("MikroORM");
	});
});

describe("no-manual-instantiation", () => {
	const CODE = `
    export class OrdersService {
      run() {
        const a = new UsersService();
        const b = new ValidationPipe({ whitelist: true });
        return [a, b];
      }
    }
  `;

	it("reports a class NestJS could inject", () => {
		const diags = runRule(
			noManualInstantiation,
			CODE,
			"test.ts",
			{},
			undefined,
			new Set(["UsersService"])
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UsersService");
	});

	it("does not report a class NestJS does not know", () => {
		const diags = runRule(
			noManualInstantiation,
			CODE,
			"test.ts",
			{},
			undefined,
			new Set(["UsersService"])
		);
		expect(diags.some((d) => d.message.includes("ValidationPipe"))).toBe(false);
	});

	it("reports both when the DI facts are unavailable", () => {
		const diags = runRule(noManualInstantiation, CODE);
		expect(diags).toHaveLength(2);
	});

	it("flags new SomeService()", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class OrdersController {
        run() {
          return new UserService();
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UserService");
	});

	it("flags new SomeRepository()", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class UsersService {
        load() {
          return new UsersRepository();
        }
      }
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

	it("flags Service/Repository inside class members", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class OrdersController {
        private readonly svc = new UserService();
        run() {
          return new UsersRepository();
        }
      }
    `
		);
		expect(diags).toHaveLength(2);
	});

	it("does not flag excluded classes via rule options", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class AppService {
        run() {
          return new LoggerService();
        }
      }
    `,
			"test.ts",
			{
				rules: {
					"architecture/no-manual-instantiation": {
						options: { excludeClasses: ["LoggerService"] },
					},
				},
			}
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag excluded classes via direct excludeClasses override", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class AppService {
        run() {
          return new LoggerService();
        }
      }
    `,
			"test.ts",
			{
				rules: {
					"architecture/no-manual-instantiation": {
						excludeClasses: ["LoggerService"],
					},
				},
			}
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag qualified class name when simple name is excluded", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class AppService {
        run() {
          return new Foo.LoggerService();
        }
      }
    `,
			"test.ts",
			{
				rules: {
					"architecture/no-manual-instantiation": {
						excludeClasses: ["LoggerService"],
					},
				},
			}
		);
		expect(diags).toHaveLength(0);
	});

	it("excludes multiple classes and still flags others", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class AppService {
        run() {
          const logger = new LoggerService();
          const cache = new CacheService();
          const user = new UserService();
          return [logger, cache, user];
        }
      }
    `,
			"test.ts",
			{
				rules: {
					"architecture/no-manual-instantiation": {
						excludeClasses: ["LoggerService", "CacheService"],
					},
				},
			}
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UserService");
	});

	it("excludes full qualified name via exprText match", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class AppService {
        run() {
          return new Foo.LoggerService();
        }
      }
    `,
			"test.ts",
			{
				rules: {
					"architecture/no-manual-instantiation": {
						excludeClasses: ["Foo.LoggerService"],
					},
				},
			}
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags DI-only classes when excludeClasses is empty", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      class AppService {
        run() {
          return new UserService();
        }
      }
    `,
			"test.ts",
			{
				rules: {
					"architecture/no-manual-instantiation": {
						excludeClasses: [],
					},
				},
			}
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("UserService");
	});

	it("does not flag construction inside a dynamic module's options", () => {
		const diags = runRule(
			noManualInstantiation,
			`
	      import { Module } from '@nestjs/common';
	      import { HeaderResolver, I18nModule } from 'nestjs-i18n';

	      @Module({
	        imports: [
	          I18nModule.forRootAsync({
	            resolvers: [new HeaderResolver(['x-lang'])],
	          }),
	        ],
	      })
	      export class AppModule {}
	    `
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags construction inside a parameter decorator", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      import { Inject, Injectable } from '@nestjs/common';

      @Injectable()
      export class ReportService {
        constructor(@Inject(new ConfigService()) private readonly config: unknown) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("does not flag a useValue provider instance", () => {
		const diags = runRule(
			noManualInstantiation,
			`
	      import { Module } from '@nestjs/common';

	      @Module({
	        providers: [{ provide: 'TOKEN', useValue: new MailerService() }],
	      })
	      export class AppModule {}
	    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-manual-instantiation: provider factories (#293)", () => {
	const DI = new Set([
		"MailerService",
		"ConfigService",
		"CustomValidationPipe",
	]);
	const runProviderRule = (
		code: string,
		diProviders: ReadonlySet<string> = DI,
		config: NestjsDoctorConfig = {}
	) =>
		runRule(
			noManualInstantiation,
			code,
			"test.ts",
			config,
			undefined,
			diProviders
		);

	it.each([
		[
			"a factory body in a standalone const provider",
			`
        export const mailerProvider = {
          provide: 'MAILER_TOKEN',
          inject: [ConfigService],
          useFactory: (config) =>
            new MailerService({ host: config.smtpHost }, { from: config.from }),
        };
      `,
		],
		[
			"an async factory with control flow around the construction",
			`
        export const storageProvider = {
          provide: 'STORAGE',
          inject: [ConfigService],
          useFactory: async (config) => {
            if (config.driver === 's3') {
              try {
                return new MailerService(config.s3, {});
              } catch {
                // fall through
              }
            }
            return new MailerService(config.local, {});
          },
        };
      `,
		],
		[
			"constructions inside the object a factory returns",
			`
        export const paymentsProvider = {
          provide: 'PAYMENTS_BUNDLE',
          inject: [ConfigService],
          useFactory: (config) => ({
            charges: new MailerService(config.stripe, {}),
            cache: new ConfigService(config.redis),
          }),
        };
      `,
		],
		[
			"a method-shorthand factory",
			`
        export const fxProvider = {
          provide: 'FX_RATES',
          inject: [ConfigService],
          useFactory(config) {
            return new MailerService(config.url, {});
          },
        };
      `,
		],
		[
			"a useValue construction outside any decorator",
			`
        export const paymentProvider = {
          provide: 'PAYMENT_GATEWAY',
          useValue: new MailerService(process.env.KEY ?? '', {}),
        };
      `,
		],
		[
			"options handed directly to a forRoot call outside a decorator",
			`
        export const dynamicModule = MailModule.forRoot({
          transport: new MailerService({ host: 'smtp' }, {}),
          templateAdapter: new ConfigService({}),
        });
      `,
		],
		[
			"providers declared as a plain exported array",
			`
        export const queueProviders = [
          {
            provide: 'MAIL_QUEUE',
            inject: [ConfigService],
            useFactory: (config) => new MailerService(config.url, {}),
          },
        ];
      `,
		],
		[
			"a named factory referenced by a provider",
			`
        function createMailer(config) {
          return new MailerService(config.url, {});
        }
        export const mailerProvider = {
          provide: 'MAILER',
          inject: [ConfigService],
          useFactory: createMailer,
        };
      `,
		],
		[
			"an identifier-backed useValue provider",
			`
        const mailer = new MailerService({}, {});
        export const mailerProvider = {
          provide: 'MAILER',
          useValue: mailer,
        };
      `,
		],
		[
			"options assembled in a module-scope helper",
			`
        function buildMailOptions() {
          return { transport: new MailerService({}, {}) };
        }
      `,
		],
		[
			"a hoisted instance captured by a passthrough factory",
			`
        const impl = new MailerService({}, {});
        export const CACHE_PROVIDER = {
          provide: 'CACHE',
          useFactory: () => impl,
        };
      `,
		],
		[
			"a context-aware injectable constructed during bootstrap",
			`
        function bootstrap(app) {
          app.useGlobalPipes(new CustomValidationPipe());
        }
      `,
		],
		[
			"a static class factory referenced by a provider",
			`
        class MailerFactory {
          static create(config) {
            return new MailerService(config.url, {});
          }
        }
        export const mailerProvider = {
          provide: 'MAILER',
          inject: [ConfigService],
          useFactory: MailerFactory.create,
        };
      `,
		],
		[
			"a static class value referenced by a provider",
			`
        class MailerFactory {
          static readonly instance = new MailerService({}, {});
        }
        export const mailerProvider = {
          provide: 'MAILER',
          useValue: MailerFactory.instance,
        };
      `,
		],
	])("does not flag %s", (_name, code) => {
		expect(runProviderRule(code)).toHaveLength(0);
	});

	it.each([
		[
			"a bypass inside a service method",
			`
        class ReportComposer {
          snapshot() {
            return new MailerService({}, {});
          }
        }
      `,
		],
		[
			"a literal that has useFactory but no provide key",
			`
        class LegacyService {
          build() {
            return {
              inject: [ConfigService],
              useFactory: (config) => new MailerService(config, {}),
            };
          }
        }
      `,
		],
	])("still flags %s", (_name, code) => {
		expect(runProviderRule(code)).toHaveLength(1);
	});

	it("does not guess that an unsuffixed class is a provider", () => {
		expect(
			runProviderRule(
				`
      class AuthService {
        constructor(users) {
          this.strategy = new LocalStrategy(users);
        }
      }
    `,
				new Set(["LocalStrategy"])
			)
		).toHaveLength(0);
	});

	it("still respects excludedClasses for provider factories", () => {
		const diags = runProviderRule(
			`
      class ReportComposer {
        snapshot() {
          return new MailerService({}, {});
        }
      }
    `,
			DI,
			{
				rules: {
					"architecture/no-manual-instantiation": {
						excludeClasses: ["MailerService"],
					},
				},
			}
		);
		expect(diags).toHaveLength(0);
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
	it("does not flag an import that stays inside its own module", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { FileEntity } from '../entities/file.entity';
    `,
			"/src/files/mappers/file.mapper.ts",
			{},
			new Set(["/src/files", "/src"])
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags a cross-module import when directories are known", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { OrderEntity } from '../orders/entities/order.entity';
    `,
			"/src/billing/billing.service.ts",
			{},
			new Set(["/src/billing", "/src/orders", "/src"])
		);
		expect(diags).toHaveLength(1);
	});

	it("flags an import crossing between nested sibling modules", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { FileEntity } from '../../relational/entities/file.entity';
    `,
			"/src/files/persistence/document/mappers/file.mapper.ts",
			{},
			new Set([
				"/src/files",
				"/src/files/persistence/document",
				"/src/files/persistence/relational",
			])
		);
		expect(diags).toHaveLength(1);
	});

	it("does not flag folders that share their only module", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { OrderEntity } from '../orders/entities/order.entity';
    `,
			"/src/billing/billing.service.ts",
			{},
			new Set(["/src"])
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags when no module directory contains the source file", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { UsersRepository } from '../users/repositories/users.repository';
    `,
			"/src/tools/tool.ts",
			{},
			new Set(["/src/users"])
		);
		expect(diags).toHaveLength(1);
	});

	it("still flags when the target does not resolve to a scanned file", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { UsersRepository } from '../../../../users/repositories/users.repository';
    `,
			"/src/orders/orders.service.ts",
			{},
			new Set(["/src/orders", "/src/users"])
		);
		expect(diags).toHaveLength(1);
	});

	it("still flags when the scan found no module at all", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { UsersRepository } from '../users/repositories/users.repository';
    `,
			"/src/orders/orders.service.ts",
			{},
			new Set()
		);
		expect(diags).toHaveLength(1);
	});

	it("does not flag an import into a directory that holds no module", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { WherePipe } from '../../pipes/where.pipe';
    `,
			"/src/modules/sessions/sessions.controller.ts",
			{},
			new Set(["/src/modules/sessions"]),
			undefined,
			["/src/pipes/where.pipe.ts"]
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag an import into the module that contains this one", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { ApiResponse } from '../common/dto/api-response.dto';
    `,
			"/src/auth/auth.service.ts",
			{},
			new Set(["/src", "/src/auth"]),
			undefined,
			["/src/common/dto/api-response.dto.ts"]
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags an import into a sibling module", () => {
		const diags = runRule(
			requireModuleBoundaries,
			`
      import { Verification } from '../auth/entities/verification.entity';
    `,
			"/src/db/db.module.ts",
			{},
			new Set(["/src", "/src/db", "/src/auth"])
		);
		expect(diags).toHaveLength(1);
	});
});

describe("no-orm-in-services duplicates", () => {
	it("reports one diagnostic however many repositories are injected", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UserService {
        constructor(
          @InjectRepository(User) private a: Repository<User>,
          @InjectRepository(Role) private b: Repository<Role>,
          @InjectRepository(Team) private c: Repository<Team>,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("reports one diagnostic for two parameters of the same ORM type", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class ReportService {
        constructor(
          private readonly primary: EntityManager,
          private readonly replica: EntityManager,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("still reports two different ORM types", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class ReportService {
        constructor(
          private readonly em: EntityManager,
          private readonly source: DataSource,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(2);
	});

	it("still reports each distinct reason once", () => {
		const diags = runRule(
			noOrmInServices,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UserService {
        constructor(
          @InjectRepository(User) private a: Repository<User>,
          @InjectRepository(Role) private b: Repository<Role>,
          @InjectModel(Doc.name) private c: Model<Doc>,
          private d: EntityManager,
        ) {}
      }
    `
		);
		expect(diags).toHaveLength(3);
	});
});

describe("no-barrel-export-internals", () => {
	it("still flags a barrel when the scan found no module at all", () => {
		const diags = runRule(
			noBarrelExportInternals,
			`
      export * from './users.repository';
    `,
			"/src/users/index.ts",
			{},
			new Set()
		);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("does not flag a folder barrel that has no module beside it", () => {
		const diags = runRule(
			noBarrelExportInternals,
			`
      export * from './jwt.guard';
      export * from './roles.guard';
    `,
			"/src/common/guards/index.ts",
			{},
			new Set(["/src"])
		);
		expect(diags).toHaveLength(0);
	});

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
