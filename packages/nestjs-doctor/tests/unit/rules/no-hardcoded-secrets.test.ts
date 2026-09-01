import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../../src/common/diagnostic.js";
import { noHardcodedSecrets } from "../../../src/engine/rules/definitions/security/no-hardcoded-secrets.js";

function runRule(code: string, filePath = "test.ts"): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile(filePath, code);
	const diagnostics: Diagnostic[] = [];

	noHardcodedSecrets.check({
		sourceFile,
		filePath,
		report(partial) {
			diagnostics.push({
				...partial,
				rule: noHardcodedSecrets.meta.id,
				category: noHardcodedSecrets.meta.category,
				severity: noHardcodedSecrets.meta.severity,
			});
		},
	});

	return diagnostics;
}

describe("no-hardcoded-secrets", () => {
	it("flags a colon value that does not name the binding", () => {
		const diags = runRule(`
      export const authToken = "admin:supersecret1";
      export const dbPassword = "root:hunter2";
    `);
		expect(diags).toHaveLength(2);
	});

	it("still ignores a permission scope that names the binding", () => {
		const diags = runRule(`
      export const password = "password:update";
      export const apiKey = "apikey:rotate";
    `);
		expect(diags).toHaveLength(0);
	});

	it("flags a class property holding a secret", () => {
		const diags = runRule(`
      export class SocketConstants {
        public static readonly AUTH_TOKEN = 'FutureIsComing';
      }
    `);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("AUTH_TOKEN");
	});

	it("flags a private readonly password field", () => {
		const diags = runRule(`
      import { Injectable } from '@nestjs/common';
      @Injectable()
      export class MailService {
        private readonly password = 'hunter2hunter2hunter2';
      }
    `);
		expect(diags).toHaveLength(1);
		expect(diags[0].message).toContain("password");
	});

	it("does not flag a class property read from the environment", () => {
		const diags = runRule(`
      export class Config {
        private readonly apiSecret = process.env.API_SECRET;
      }
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag a class property whose value echoes its name", () => {
		const diags = runRule(`
      export class Fields {
        readonly passwordField = 'password';
      }
    `);
		expect(diags).toHaveLength(0);
	});

	it("flags hardcoded secret key patterns", () => {
		const diags = runRule(`
      const token = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
    `);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("flags variables with suspicious names containing string values", () => {
		const diags = runRule(`
      const apiKey = 'my-super-secret-api-key-12345';
    `);
		expect(diags.length).toBeGreaterThan(0);
		expect(diags.some((d) => d.message.includes("apiKey"))).toBe(true);
	});

	it("flags property assignments with suspicious names", () => {
		const diags = runRule(`
      const config = {
        secret: 'my-jwt-secret-that-should-be-in-env-2024',
      };
    `);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("does not flag short strings", () => {
		const diags = runRule(`
      const name = 'hello';
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag non-suspicious variable names", () => {
		const diags = runRule(`
      const greeting = 'Hello, this is a long enough string';
    `);
		expect(diags).toHaveLength(0);
	});

	it("flags GitHub PAT tokens", () => {
		const diags = runRule(`
      const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn';
    `);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("flags AWS access key IDs", () => {
		const diags = runRule(`
      const key = 'AKIAIOSFODNN7EXAMPLE';
    `);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("does not flag human-readable text with suspicious property names", () => {
		const diags = runRule(`
      export const ActivityLogEvents = {
        PASSWORD_CHANGED: 'Password changed',
        USER_CREATED: 'User created',
      };
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag dot-separated error codes with suspicious property names", () => {
		const diags = runRule(`
      export const AuthErrorCodes = {
        WEAK_PASSWORD: 'AUTH.WEAK_PASSWORD',
        AUTH0_UPDATE_FAILED: 'AUTH.UPDATE_FAILED',
      } as const;
    `);
		expect(diags).toHaveLength(0);
	});

	it("still flags real secrets regardless of file path", () => {
		const diags = runRule(`
      const token = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
    `);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("does not flag snake_case DB constraint names", () => {
		const diags = runRule(`
      const idx = 'IDX_user_email_constraint_abc123def456ghi789jkl';
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag a message key inside a thrown exception", () => {
		const diags = runRule(`
      function check() {
        throw new UnprocessableEntityException({
          errors: { password: 'incorrectPassword' },
        });
      }
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag a permission scope value", () => {
		const diags = runRule(`
      export const permissions = {
        PASSWORD_UPDATE: 'password:update',
        PASSWORD_RESET: 'pass:reset',
      };
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag a value that only restates its own name", () => {
		const diags = runRule(
			"export const SYS_USER_INITPASSWORD = 'sys_user_initPassword';"
		);
		expect(diags).toHaveLength(0);
	});

	it("still flags a word-shaped credential outside a throw", () => {
		const diags = runRule(`
      const config = { password: 'correct-horse-battery-staple-2024' };
    `);
		expect(diags).toHaveLength(1);
	});

	it("still flags a credential pair and a hyphenated secret", () => {
		expect(runRule("const password = 'admin/administrator2';")).toHaveLength(1);
		expect(
			runRule("const apiKey = 'super-secret-key-value-2024';")
		).toHaveLength(1);
	});

	it("still flags a real secret assigned inside a throw", () => {
		const diags = runRule(`
      function boom() {
        throw new Error('AKIA1234567890ABCDEF');
      }
    `);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("still flags a credential nested inside a thrown payload", () => {
		const diags = runRule(`
      function boom() {
        throw new InternalServerErrorException({
          message: 'Upstream call failed',
          debug: { apiKey: 'AKIAIOSFODNN7EXAMPLE1234567890AB' },
        });
      }
    `);
		expect(diags).toHaveLength(1);
	});

	it("still flags a colon-separated credential pair", () => {
		expect(runRule("const authToken = 'admin:secretpass123';")).toHaveLength(1);
	});

	it("flags keys that carry an environment segment", () => {
		for (const key of [
			"sk_live_51H8xQ2LmNpQrStUvWxYz0123456789",
			"pk_live_51H8xQ2LmNpQrStUvWxYz0123456789",
			"rk_test_51H8xQ2LmNpQrStUvWxYz0123456789",
			"sk-proj-abc123XYZdef456GHIjkl789MNO",
			"sk-ant-api03-Abc123XYZdef456GHIjkl789MNO",
		]) {
			expect(runRule(`const client = '${key}';`).length).toBeGreaterThan(0);
		}
	});

	it("does not flag prefixed identifiers that carry no digits", () => {
		for (const value of [
			"sk_some_long_variable_name_here",
			"sk-config-default-value-name",
			"sk_module_config_provider_token",
		]) {
			expect(runRule(`const name = '${value}';`)).toHaveLength(0);
		}
	});

	describe("2026-09 false-positive fixes", () => {
		it("does not flag realistic non-secret identifiers and messages", () => {
			const cases = [
				"const API_KEY_HEADER = 'x-api-key';",
				"const config = { apiKeyName: 'x-tenant-api-key' };",
				"const passwordRegex = '^(?=.*[a-z])(?=.*[A-Z]).{8,}$';",
				"const passwordResetTemplate = 'password-reset-email';",
				"const AUTH_TOKEN_KEY = 'auth_token_storage';",
				"const secretName = 'my-app/prod/db-credentials';",
				`class Cache {
					private readonly apiKeyCachePrefix = 'apikey:lookup:v2';
				}`,
				"const JWT_SECRET_TOKEN = 'JWT_SECRET_TOKEN_PROVIDER';",
				"const secretEnvVar = 'DATABASE_PASSWORD';",
				"const secretRotationQueue = 'secret-rotation-queue';",
				"const passwordMessage = 'errors.password.tooShort';",
				`class CreateUserDto {
					@IsString({ message: 'password must be stronger' })
					password: string;
				}`,
			];
			for (const code of cases) {
				expect(runRule(code)).toHaveLength(0);
			}
		});

		it("still flags real credentials", () => {
			const cases = [
				"const password = 'Tr0ub4dor&3xyz';",
				"const stripeKey = 'sk_live_51H8xQ2LmNpQrStUvWxYz0123456789';",
				"const password = 'P@ssw0rd!2024';",
				"const password = 'hunter2hunter2';",
				"const password = 'correcthorsebatterystaple';",
				"const password = 'admin_password_123';",
			];
			for (const code of cases) {
				expect(runRule(code).length).toBeGreaterThan(0);
			}
		});

		it("does not flag a 64-hex digest with no suspicious binding name", () => {
			const hex =
				"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
			const cases = [
				`const expectedDigest = '${hex}';`,
				`class Migration1699999999999 implements MigrationInterface {
					name = '${hex}';
				}`,
				`const sha256Hash = '${hex}';`,
			];
			for (const code of cases) {
				expect(runRule(code)).toHaveLength(0);
			}
		});

		it("still flags a 64-hex value bound to a suspicious name", () => {
			const hex =
				"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
			expect(runRule(`const apiSecret = '${hex}';`).length).toBeGreaterThan(0);
		});

		// Accepted false negatives: purely alphabetic, multi-word values look
		// like identifiers, not secrets. Vendor-format patterns still catch a
		// real credential regardless of what it is assigned to.
		it("accepts two false negatives for low-entropy alphabetic placeholders", () => {
			expect(runRule("const secretValue = 'SuperSecret_Value';")).toHaveLength(
				0
			);
			expect(
				runRule("const jwtSecret = 'my-super-secret-jwt-key';")
			).toHaveLength(0);
		});
	});
});
