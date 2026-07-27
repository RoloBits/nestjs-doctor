import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildGuardDecoratorNames } from "../../src/engine/graph/guard-decorators.js";

function index(code: string): Set<string> {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile("/decorators.ts", code);
	return buildGuardDecoratorNames(project, ["/decorators.ts"]);
}

describe("buildGuardDecoratorNames", () => {
	it("indexes a function returning applyDecorators(UseGuards(...))", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export function Auth(roles = []) {
        return applyDecorators(Roles(roles), UseGuards(AuthGuard, RolesGuard));
      }
    `);
		expect([...names]).toEqual(["Auth"]);
	});

	it("indexes an arrow function with a concise body", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export const Protected = () => applyDecorators(UseGuards(AuthGuard));
    `);
		expect([...names]).toEqual(["Protected"]);
	});

	it("indexes an arrow function with a block body", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export const Protected = () => {
        return applyDecorators(UseGuards(AuthGuard));
      };
    `);
		expect([...names]).toEqual(["Protected"]);
	});

	it("ignores a composition that applies no guard", () => {
		const names = index(`
      import { applyDecorators } from '@nestjs/common';
      export function Documented() {
        return applyDecorators(ApiOperation(), ApiOkResponse());
      }
    `);
		expect(names.size).toBe(0);
	});

	it("ignores a function that calls UseGuards without composing a decorator", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export function notADecorator() {
        const x = UseGuards(AuthGuard);
        return x;
      }
    `);
		expect(names.size).toBe(0);
	});

	it("returns an empty set for a file it was not given", () => {
		const project = new Project({ useInMemoryFileSystem: true });
		project.createSourceFile(
			"/other.ts",
			"export function Auth() { return applyDecorators(UseGuards(G)); }"
		);
		expect(buildGuardDecoratorNames(project, ["/missing.ts"]).size).toBe(0);
	});
});
