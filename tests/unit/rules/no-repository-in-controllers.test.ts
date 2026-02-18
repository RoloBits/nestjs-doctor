import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { noRepositoryInControllers } from "../../../src/rules/architecture/no-repository-in-controllers.js";
import type { Diagnostic } from "../../../src/types/diagnostic.js";

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
	it("flags Repository injection in controllers", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';

      @Controller('users')
      export class UsersController {
        constructor(private readonly usersRepository: UsersRepository) {}
      }
    `);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags.some((d) => d.message.includes("UsersRepository"))).toBe(
			true,
		);
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
		const repoDiags = diags.filter((d) =>
			d.message.includes("repository") || d.message.includes("Repository"),
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

	it("flags import from /repositories/ path in controllers", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';
      import { UsersRepository } from '../repositories/users.repository';

      @Controller('users')
      export class UsersController {
        constructor(private readonly usersService: any) {}
      }
    `);
		expect(diags.some((d) => d.message.includes("repository path"))).toBe(
			true,
		);
	});
});
