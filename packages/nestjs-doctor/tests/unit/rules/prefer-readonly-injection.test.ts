import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { preferReadonlyInjection } from "../../../src/engine/rules/definitions/correctness/prefer-readonly-injection.js";

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
	it("reports the column of the parameter, not a file offset", () => {
		const code = [
			"import { Injectable } from '@nestjs/common';",
			"",
			"@Injectable()",
			"export class UsersService {",
			"  constructor(private repo: any) {}",
			"}",
		].join("\n");
		const diags = runRule(code);
		expect(diags).toHaveLength(1);
		const diag = diags[0];
		if (!("line" in diag)) {
			throw new Error("expected a code diagnostic");
		}
		const declLine = code.split("\n")[diag.line - 1];
		expect(diag.column).toBe(declLine.indexOf("repo") + 1);
		expect(diag.column).toBeLessThanOrEqual(declLine.length);
	});

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
