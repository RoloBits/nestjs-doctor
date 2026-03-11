import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/common/config.js";
import { collectFiles } from "../../src/engine/file-collector.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const TESTS_DIR_RE = /\/__tests__\//;
const MOCKS_DIR_RE = /\/__mocks__\//;
const FIXTURES_DIR_RE = /\/__fixtures__\//;

describe("file-collector", () => {
	it("collects .ts files from basic-app", async () => {
		const files = await collectFiles(resolve(FIXTURES, "basic-app/src"));
		expect(files.length).toBeGreaterThan(0);
		expect(files.every((f) => f.endsWith(".ts"))).toBe(true);
	});

	it("excludes node_modules and dist by default", async () => {
		const files = await collectFiles(resolve(FIXTURES, "basic-app/src"));
		expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
		expect(files.every((f) => !f.includes("dist"))).toBe(true);
	});

	it("returns sorted file list", async () => {
		const files = await collectFiles(resolve(FIXTURES, "basic-app/src"));
		const sorted = [...files].sort();
		expect(files).toEqual(sorted);
	});

	it("DEFAULT_CONFIG excludes common test patterns", () => {
		const exclude = DEFAULT_CONFIG.exclude ?? [];
		const expectedPatterns = [
			"**/*.spec.ts",
			"**/*.test.ts",
			"**/*.e2e-spec.ts",
			"**/*.e2e-test.ts",
			"**/test/**",
			"**/tests/**",
			"**/__tests__/**",
			"**/__mocks__/**",
			"**/__fixtures__/**",
			"**/mock/**",
			"**/mocks/**",
			"**/*.mock.ts",
			"**/seeder/**",
			"**/seeders/**",
			"**/*.seed.ts",
			"**/*.seeder.ts",
		];
		for (const pattern of expectedPatterns) {
			expect(exclude).toContain(pattern);
		}
	});

	it("DEFAULT_CONFIG excludes node_modules, dist, build, coverage with ** prefix", () => {
		const exclude = DEFAULT_CONFIG.exclude ?? [];
		expect(exclude).toContain("**/node_modules/**");
		expect(exclude).toContain("**/dist/**");
		expect(exclude).toContain("**/build/**");
		expect(exclude).toContain("**/coverage/**");
	});

	it("DEFAULT_CONFIG excludes root-level config files", () => {
		const exclude = DEFAULT_CONFIG.exclude ?? [];
		expect(exclude).toContain("*.config.ts");
		expect(exclude).toContain("*.config.js");
		expect(exclude).toContain("*.config.mjs");
		expect(exclude).toContain("*.config.cjs");
		expect(exclude).toContain("*.config.mts");
		expect(exclude).toContain("*.config.cts");
	});

	it("excludes test directory files by default", async () => {
		const files = await collectFiles(resolve(FIXTURES, "basic-app/src"));
		for (const f of files) {
			expect(f).not.toMatch(TESTS_DIR_RE);
			expect(f).not.toMatch(MOCKS_DIR_RE);
			expect(f).not.toMatch(FIXTURES_DIR_RE);
		}
	});
});
