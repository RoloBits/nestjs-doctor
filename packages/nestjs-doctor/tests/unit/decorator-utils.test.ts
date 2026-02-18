import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	getClassType,
	getConstructorParams,
	hasDecorator,
	isController,
	isModule,
	isService,
} from "../../src/engine/decorator-utils.js";

function createClass(code: string) {
	const project = new Project({ useInMemoryFileSystem: true });
	const file = project.createSourceFile("test.ts", code);
	return file.getClasses()[0];
}

describe("decorator-utils", () => {
	it("detects @Controller decorator", () => {
		const cls = createClass(`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {}
    `);
		expect(isController(cls)).toBe(true);
		expect(isService(cls)).toBe(false);
		expect(getClassType(cls)).toBe("controller");
	});

	it("detects @Injectable decorator", () => {
		const cls = createClass(`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {}
    `);
		expect(isService(cls)).toBe(true);
		expect(isController(cls)).toBe(false);
		expect(getClassType(cls)).toBe("service");
	});

	it("detects @Module decorator", () => {
		const cls = createClass(`
      import { Module } from '@nestjs/common';
      @Module({})
      export class AppModule {}
    `);
		expect(isModule(cls)).toBe(true);
		expect(getClassType(cls)).toBe("module");
	});

	it("returns unknown for undecorated classes", () => {
		const cls = createClass(`
      export class PlainClass {}
    `);
		expect(getClassType(cls)).toBe("unknown");
	});

	it("checks arbitrary decorator names", () => {
		const cls = createClass(`
      function MyDecorator() { return (target: any) => target; }
      @MyDecorator()
      export class MyClass {}
    `);
		expect(hasDecorator(cls, "MyDecorator")).toBe(true);
		expect(hasDecorator(cls, "Other")).toBe(false);
	});

	it("extracts constructor params", () => {
		const cls = createClass(`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        constructor(
          private readonly repo: any,
          private config: any,
        ) {}
      }
    `);
		const params = getConstructorParams(cls);
		expect(params).toHaveLength(2);
		expect(params[0].name).toBe("repo");
		expect(params[0].isReadonly).toBe(true);
		expect(params[1].name).toBe("config");
		expect(params[1].isReadonly).toBe(false);
	});
});
