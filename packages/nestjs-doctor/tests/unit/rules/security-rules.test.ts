import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { noCsrfDisabled } from "../../../src/engine/rules/definitions/security/no-csrf-disabled.js";
import { noDangerousRedirects } from "../../../src/engine/rules/definitions/security/no-dangerous-redirects.js";
import { noEval } from "../../../src/engine/rules/definitions/security/no-eval.js";
import { noExposedEnvVars } from "../../../src/engine/rules/definitions/security/no-exposed-env-vars.js";
import { noExposedStackTrace } from "../../../src/engine/rules/definitions/security/no-exposed-stack-trace.js";
import { noRawEntityInResponse } from "../../../src/engine/rules/definitions/security/no-raw-entity-in-response.js";
import { noSynchronizeInProduction } from "../../../src/engine/rules/definitions/security/no-synchronize-in-production.js";
import { noWeakCrypto } from "../../../src/engine/rules/definitions/security/no-weak-crypto.js";
import { requireGuardsOnEndpoints } from "../../../src/engine/rules/definitions/security/require-guards-on-endpoints.js";
import type { Rule } from "../../../src/engine/rules/types.js";

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

describe("no-eval", () => {
	it("flags eval()", () => {
		const diags = runRule(
			noEval,
			`
      const result = eval('1 + 1');
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("eval");
	});

	it("flags new Function()", () => {
		const diags = runRule(
			noEval,
			`
      const fn = new Function('return 1');
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("Function");
	});

	it("does not flag other functions", () => {
		const diags = runRule(
			noEval,
			`
      const result = someFunction('test');
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-weak-crypto", () => {
	it("flags createHash('md5')", () => {
		const diags = runRule(
			noWeakCrypto,
			`
      import { createHash } from 'crypto';
      const hash = createHash('md5');
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("md5");
	});

	it("flags createHash('sha1')", () => {
		const diags = runRule(
			noWeakCrypto,
			`
      import { createHash } from 'crypto';
      const hash = createHash('sha1');
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("allows createHash('sha256')", () => {
		const diags = runRule(
			noWeakCrypto,
			`
      import { createHash } from 'crypto';
      const hash = createHash('sha256');
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-exposed-env-vars", () => {
	it("flags process.env in @Injectable class", () => {
		const diags = runRule(
			noExposedEnvVars,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class ConfigHelper {
        getPort() {
          return process.env.PORT;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("process.env");
	});

	it("does not flag process.env in non-Injectable classes", () => {
		const diags = runRule(
			noExposedEnvVars,
			`
      export class Helper {
        getPort() {
          return process.env.PORT;
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-csrf-disabled", () => {
	it("flags csrf: false", () => {
		const diags = runRule(
			noCsrfDisabled,
			`
      const config = { csrf: false };
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("CSRF");
	});

	it("flags csrfProtection: false", () => {
		const diags = runRule(
			noCsrfDisabled,
			`
      const config = { csrfProtection: false };
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("allows csrf: true", () => {
		const diags = runRule(
			noCsrfDisabled,
			`
      const config = { csrf: true };
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-exposed-stack-trace", () => {
	it("flags error.stack in return statement", () => {
		const diags = runRule(
			noExposedStackTrace,
			`
      function handle() {
        try {} catch (error) {
          return error.stack;
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("stack");
	});

	it("flags err.stack in property assignment", () => {
		const diags = runRule(
			noExposedStackTrace,
			`
      function handle() {
        try {} catch (err) {
          return { stack: err.stack };
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
	});

	it("does not flag unrelated .stack access", () => {
		const diags = runRule(
			noExposedStackTrace,
			`
      const stack = myArray.stack;
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-dangerous-redirects", () => {
	it("flags redirect with @Query param", () => {
		const diags = runRule(
			noDangerousRedirects,
			`
      import { Controller, Get, Query, Res } from '@nestjs/common';
      @Controller()
      export class AuthController {
        @Get('callback')
        callback(@Query('returnUrl') returnUrl: string, @Res() res: any) {
          res.redirect(returnUrl);
        }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("returnUrl");
	});

	it("allows redirect with static URL", () => {
		const diags = runRule(
			noDangerousRedirects,
			`
      import { Controller, Get, Res } from '@nestjs/common';
      @Controller()
      export class AuthController {
        @Get('callback')
        callback(@Res() res: any) {
          res.redirect('/dashboard');
        }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-synchronize-in-production", () => {
	it("flags synchronize: true", () => {
		const diags = runRule(
			noSynchronizeInProduction,
			`
      const config = {
        type: 'postgres',
        synchronize: true,
      };
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("synchronize");
	});

	it("allows synchronize: false", () => {
		const diags = runRule(
			noSynchronizeInProduction,
			`
      const config = {
        type: 'postgres',
        synchronize: false,
      };
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows synchronize with env check", () => {
		const diags = runRule(
			noSynchronizeInProduction,
			`
      const config = {
        type: 'postgres',
        synchronize: process.env.NODE_ENV !== 'production',
      };
    `
		);
		expect(diags).toHaveLength(0);
	});
});

describe("no-raw-entity-in-response", () => {
	it("flags controller returning entity type", () => {
		const diags = runRule(
			noRawEntityInResponse,
			`
      import { Controller, Get } from '@nestjs/common';
      class UserEntity { id: number; password: string; }
      @Controller('users')
      export class UsersController {
        @Get()
        findAll(): UserEntity[] { return []; }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("raw entity");
	});

	it("allows controller returning DTO type", () => {
		const diags = runRule(
			noRawEntityInResponse,
			`
      import { Controller, Get } from '@nestjs/common';
      class UserDto { id: number; name: string; }
      @Controller('users')
      export class UsersController {
        @Get()
        findAll(): UserDto[] { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags Promise<UserEntity> return type", () => {
		const diags = runRule(
			noRawEntityInResponse,
			`
      import { Controller, Get } from '@nestjs/common';
      class UserEntity { id: number; password: string; }
      @Controller('users')
      export class UsersController {
        @Get(':id')
        async findOne(): Promise<UserEntity> { return new UserEntity(); }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("raw entity");
	});

	it("does not flag EntityManager or EntityMetadata return types", () => {
		const diags = runRule(
			noRawEntityInResponse,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('admin')
      export class AdminController {
        @Get()
        getManager(): EntityManager { return null as any; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-controller classes", () => {
		const diags = runRule(
			noRawEntityInResponse,
			`
      import { Injectable } from '@nestjs/common';
      class UserEntity { id: number; }
      @Injectable()
      export class UsersService {
        findAll(): UserEntity[] { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("flags MikroORM @Entity-decorated class with Entity suffix", () => {
		// Idiomatic MikroORM naming with the `Entity` suffix (UserEntity).
		// The current rule fires on the suffix; this confirms MikroORM users
		// following that convention get the same protection as TypeORM users.
		const diags = runRule(
			noRawEntityInResponse,
			`
      import { Controller, Get } from '@nestjs/common';
      import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

      @Entity()
      class UserEntity {
        @PrimaryKey() id!: number;
        @Property() passwordHash!: string;
      }

      @Controller('users')
      export class UsersController {
        @Get()
        findAll(): UserEntity[] { return []; }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("raw entity");
	});
});

describe("require-guards-on-endpoints", () => {
	it("flags unguarded endpoint", () => {
		const diags = runRule(
			requireGuardsOnEndpoints,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Get()
        findAll() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("findAll");
	});

	it("allows endpoint with method-level @UseGuards()", () => {
		const diags = runRule(
			requireGuardsOnEndpoints,
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

	it("allows all endpoints with class-level @UseGuards()", () => {
		const diags = runRule(
			requireGuardsOnEndpoints,
			`
      import { Controller, Get, Post, UseGuards } from '@nestjs/common';
      @Controller('users')
      @UseGuards(AuthGuard)
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

	it("skips methods with @Public() decorator", () => {
		const diags = runRule(
			requireGuardsOnEndpoints,
			`
      import { Controller, Get } from '@nestjs/common';
      @Controller('health')
      export class HealthController {
        @Get()
        @Public()
        check() { return { status: 'ok' }; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("skips all endpoints when class has @Public() decorator", () => {
		const diags = runRule(
			requireGuardsOnEndpoints,
			`
      import { Controller, Get, Post } from '@nestjs/common';
      @Controller('health')
      @Public()
      export class HealthController {
        @Get()
        check() { return { status: 'ok' }; }
        @Post()
        reset() { return {}; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-controller classes", () => {
		const diags = runRule(
			requireGuardsOnEndpoints,
			`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class UsersService {
        findAll() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-handler methods", () => {
		const diags = runRule(
			requireGuardsOnEndpoints,
			`
      import { Controller } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        helperMethod() { return 42; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});
});
