import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { noCsrfDisabled } from "../../../src/rules/security/no-csrf-disabled.js";
import { noDangerousRedirects } from "../../../src/rules/security/no-dangerous-redirects.js";
import { noEval } from "../../../src/rules/security/no-eval.js";
import { noExposedEnvVars } from "../../../src/rules/security/no-exposed-env-vars.js";
import { noExposedStackTrace } from "../../../src/rules/security/no-exposed-stack-trace.js";
import { noWeakCrypto } from "../../../src/rules/security/no-weak-crypto.js";
import { requireAuthGuard } from "../../../src/rules/security/require-auth-guard.js";
import { requireValidationPipe } from "../../../src/rules/security/require-validation-pipe.js";
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

describe("require-auth-guard", () => {
	it("flags controller without @UseGuards", () => {
		const diags = runRule(
			requireAuthGuard,
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
		expect(diags[0].message).toContain("UseGuards");
	});

	it("allows controller with class-level guard", () => {
		const diags = runRule(
			requireAuthGuard,
			`
      import { Controller, Get, UseGuards } from '@nestjs/common';
      @Controller('users')
      @UseGuards(AuthGuard)
      export class UsersController {
        @Get()
        findAll() { return []; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows controller with method-level guard", () => {
		const diags = runRule(
			requireAuthGuard,
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
});

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

describe("require-validation-pipe", () => {
	it("flags handler with @Body but no pipe", () => {
		const diags = runRule(
			requireValidationPipe,
			`
      import { Controller, Post, Body } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Post()
        create(@Body() dto: any) { return dto; }
      }
    `
		);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("validation pipe");
	});

	it("allows handler with @UsePipes on method", () => {
		const diags = runRule(
			requireValidationPipe,
			`
      import { Controller, Post, Body, UsePipes } from '@nestjs/common';
      @Controller('users')
      export class UsersController {
        @Post()
        @UsePipes(ValidationPipe)
        create(@Body() dto: any) { return dto; }
      }
    `
		);
		expect(diags).toHaveLength(0);
	});

	it("allows handler with @UsePipes on class", () => {
		const diags = runRule(
			requireValidationPipe,
			`
      import { Controller, Post, Body, UsePipes } from '@nestjs/common';
      @Controller('users')
      @UsePipes(ValidationPipe)
      export class UsersController {
        @Post()
        create(@Body() dto: any) { return dto; }
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
