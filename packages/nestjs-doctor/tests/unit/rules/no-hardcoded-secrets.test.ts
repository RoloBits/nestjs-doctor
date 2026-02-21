import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { noHardcodedSecrets } from "../../../src/rules/security/no-hardcoded-secrets.js";
import type { Diagnostic } from "../../../src/types/diagnostic.js";

function runRule(code: string): Diagnostic[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile("test.ts", code);
	const diagnostics: Diagnostic[] = [];

	noHardcodedSecrets.check({
		sourceFile,
		filePath: "test.ts",
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
        secret: 'my-jwt-secret-that-should-be-in-env',
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

	it("flags real base64 strings containing digits", () => {
		const diags = runRule(`
      const data = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop1234';
    `);
		expect(diags.length).toBeGreaterThan(0);
	});

	it("does not flag long camelCase identifier strings as base64", () => {
		const diags = runRule(`
      const config = {
        id: 'rentalRestrictionAgreementCoapplicantDoc',
      };
    `);
		expect(diags).toHaveLength(0);
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

	it("does not flag Base64-encoded JSON pagination cursors", () => {
		const diags = runRule(`
      const page = {
        cursor: 'eyJpZCI6IjQ2MDJCNjI5LTg3N0QtNEVCNC1CQzhELTREM0NGNzkzQkM2NSJ9',
        size: 10,
      };
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Base64 strings in pagination property names", () => {
		const diags = runRule(`
      const nextPageToken = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop1234';
    `);
		expect(diags).toHaveLength(0);
	});

	it("does not flag Base64-encoded JSON in non-pagination property", () => {
		const diags = runRule(`
      const config = {
        payload: 'eyJpZCI6IjQ2MDJCNjI5LTg3N0QtNEVCNC1CQzhELTREM0NGNzkzQkM2NSJ9',
      };
    `);
		expect(diags).toHaveLength(0);
	});

	it("still flags real Base64 secrets not in pagination context", () => {
		const diags = runRule(`
      const config = {
        apiCredential: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop1234',
      };
    `);
		expect(diags.length).toBeGreaterThan(0);
	});
});
