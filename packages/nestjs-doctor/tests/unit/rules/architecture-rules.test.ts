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
	diProviders?: ReadonlySet<string>
): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
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

	it("leaves an undecorated class alone even when it declares handlers", () => {
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
		expect(diags).toHaveLength(0);
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

	it("does not flag excluded classes via rule options", () => {
		const diags = runRule(
			noManualInstantiation,
			`
      const logger = new LoggerService();
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
      const logger = new LoggerService();
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
      const logger = new Foo.LoggerService();
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
      const logger = new LoggerService();
      const cache = new CacheService();
      const user = new UserService();
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
      const logger = new Foo.LoggerService();
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
      const svc = new UserService();
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
			"/elsewhere/tool.ts",
			{},
			new Set(["/src/users"])
		);
		expect(diags).toHaveLength(1);
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
