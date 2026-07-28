import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { noRepositoryInControllers } from "../../../src/engine/rules/definitions/architecture/no-repository-in-controllers.js";

function runRule(code: string): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile("test.ts", code);
	const diagnostics: Diagnostic[] = [];

	noRepositoryInControllers.check({
		sourceFile,
		filePath: "test.ts",
		report(partial) {
			diagnostics.push({
				...partial,
				rule: noRepositoryInControllers.meta.id,
				category: noRepositoryInControllers.meta.category,
				severity: noRepositoryInControllers.meta.severity,
			});
		},
	});

	return diagnostics;
}

describe("no-repository-in-controllers", () => {
	it("reports a repository import once, not once per controller", () => {
		const diags = runRule(`
      import { Controller, Get } from '@nestjs/common';
      import { UserRepo } from '../repositories/user.repo';

      @Controller('one')
      export class OneController {
        constructor(private a: string) {}
        @Get() one() { return 1; }
      }

      @Controller('two')
      export class TwoController {
        constructor(private b: string) {}
        @Get() two() { return 2; }
      }
    `);
		const imports = diags.filter((d) => d.message.includes("imports from"));
		expect(imports).toHaveLength(1);
	});

	it("does not report a repository import with no controller in the file", () => {
		const diags = runRule(`
      import { Injectable } from '@nestjs/common';
      import { UserRepo } from '../repositories/user.repo';

      @Injectable()
      export class UsersService {}
    `);
		expect(diags).toHaveLength(0);
	});

	it("matches a generic repository through the written annotation", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        constructor(private usersRepository: Repository<Account>) {}
      }
    `);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("Repository");
	});

	it("flags Repository injection in controllers", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';

      @Controller('users')
      export class UsersController {
        constructor(private readonly usersRepository: UsersRepository) {}
      }
    `);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags.some((d) => d.message.includes("UsersRepository"))).toBe(true);
	});

	it("does not flag service injection in controllers", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';

      @Controller('users')
      export class UsersController {
        constructor(private readonly usersService: UsersService) {}
      }
    `);
		// Should only have 0 repository-related diagnostics
		const repoDiags = diags.filter(
			(d) =>
				d.message.includes("repository") || d.message.includes("Repository")
		);
		expect(repoDiags).toHaveLength(0);
	});

	it("ignores repositories in non-controller classes", () => {
		const diags = runRule(`
      import { Injectable } from '@nestjs/common';

      @Injectable()
      export class UsersService {
        constructor(private readonly usersRepository: UsersRepository) {}
      }
    `);
		expect(diags).toHaveLength(0);
	});

	it("flags MikroORM EntityRepository<T> injection in controllers", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';
      import { InjectRepository } from '@mikro-orm/nestjs';
      import { EntityRepository } from '@mikro-orm/core';

      @Controller('users')
      export class UsersController {
        constructor(
          @InjectRepository(User)
          private readonly users: EntityRepository<User>,
        ) {}
      }
    `);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags.some((d) => d.message.includes("EntityRepository"))).toBe(
			true
		);
	});

	it("flags import from /repositories/ path in controllers", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';
      import { UsersRepository } from '../repositories/users.repository';

      @Controller('users')
      export class UsersController {
        constructor(private readonly usersService: any) {}
      }
    `);
		expect(diags.some((d) => d.message.includes("repository path"))).toBe(true);
	});
});
