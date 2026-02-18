import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { preferReadonlyInjection } from "../../../src/rules/correctness/prefer-readonly-injection.js";
import type { Diagnostic } from "../../../src/types/diagnostic.js";

function runRule(code: string): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile("test.ts", code);
	const diagnostics: Diagnostic[] = [];

	preferReadonlyInjection.check({
		sourceFile,
		filePath: "test.ts",
		report(partial) {
			diagnostics.push({
				...partial,
				rule: preferReadonlyInjection.meta.id,
				category: preferReadonlyInjection.meta.category,
				severity: preferReadonlyInjection.meta.severity,
			});
		},
	});

	return diagnostics;
}

describe("prefer-readonly-injection", () => {
	it("flags non-readonly constructor params in @Injectable classes", () => {
		const diags = runRule(`
      import { Injectable } from '@nestjs/common';

      @Injectable()
      export class UsersService {
        constructor(private repo: any) {}
      }
    `);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("repo");
		expect(diags[0].message).toContain("readonly");
	});

	it("does not flag readonly params", () => {
		const diags = runRule(`
      import { Injectable } from '@nestjs/common';

      @Injectable()
      export class UsersService {
        constructor(private readonly repo: any) {}
      }
    `);
		expect(diags).toHaveLength(0);
	});

	it("flags non-readonly params in @Controller classes", () => {
		const diags = runRule(`
      import { Controller } from '@nestjs/common';

      @Controller('users')
      export class UsersController {
        constructor(private service: any) {}
      }
    `);
		expect(diags).toHaveLength(1);
	});

	it("ignores plain classes without NestJS decorators", () => {
		const diags = runRule(`
      export class PlainClass {
        constructor(private repo: any) {}
      }
    `);
		expect(diags).toHaveLength(0);
	});

	it("ignores params without access modifiers", () => {
		const diags = runRule(`
      import { Injectable } from '@nestjs/common';

      @Injectable()
      export class UsersService {
        constructor(repo: any) {}
      }
    `);
		expect(diags).toHaveLength(0);
	});
});
