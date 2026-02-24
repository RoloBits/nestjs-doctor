import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCustomRules } from "../../src/core/custom-rule-loader.js";

const tempRootDirectory = fs.mkdtempSync(
	path.join(os.tmpdir(), "nestjs-doctor-custom-rules-test-")
);

afterAll(() => {
	fs.rmSync(tempRootDirectory, { recursive: true, force: true });
});

const fixturesDir = path.resolve(
	import.meta.dirname,
	"../fixtures/custom-rules"
);

describe("loadCustomRules", () => {
	describe("valid rule", () => {
		it("loads a valid rule and auto-prefixes with custom/", async () => {
			const dir = path.join(tempRootDirectory, "valid-only");
			fs.mkdirSync(dir, { recursive: true });
			fs.copyFileSync(
				path.join(fixturesDir, "valid-rule.ts"),
				path.join(dir, "valid-rule.ts")
			);

			const { rules, warnings } = await loadCustomRules(dir, tempRootDirectory);
			expect(rules).toHaveLength(1);
			expect(rules[0].meta.id).toBe("custom/no-console-log");
			expect(rules[0].meta.category).toBe("correctness");
			expect(rules[0].meta.severity).toBe("warning");
			expect(typeof rules[0].check).toBe("function");
			expect(warnings).toHaveLength(0);
		});
	});

	describe("already-prefixed ID", () => {
		it("does not double-prefix an ID that starts with custom/", async () => {
			const dir = path.join(tempRootDirectory, "already-prefixed");
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(
				path.join(dir, "prefixed.ts"),
				`export const myRule = {
					meta: {
						id: "custom/already-prefixed",
						category: "security",
						severity: "error",
						description: "Already prefixed",
						help: "No change needed.",
					},
					check() {},
				};`
			);

			const { rules } = await loadCustomRules(dir, tempRootDirectory);
			expect(rules).toHaveLength(1);
			expect(rules[0].meta.id).toBe("custom/already-prefixed");
		});
	});

	describe("invalid rule", () => {
		it("skips invalid export (missing check) with a warning", async () => {
			const dir = path.join(tempRootDirectory, "invalid-only");
			fs.mkdirSync(dir, { recursive: true });
			fs.copyFileSync(
				path.join(fixturesDir, "invalid-rule.ts"),
				path.join(dir, "invalid-rule.ts")
			);

			const { rules, warnings } = await loadCustomRules(dir, tempRootDirectory);
			expect(rules).toHaveLength(0);
			expect(warnings.length).toBeGreaterThan(0);
			expect(warnings.some((w) => w.includes("invalid-rule.ts"))).toBe(true);
		});
	});

	describe("syntax error in file", () => {
		it("produces a warning instead of crashing", async () => {
			const dir = path.join(tempRootDirectory, "syntax-error");
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(
				path.join(dir, "bad-syntax.ts"),
				"export const x = {{{BROKEN"
			);

			const { rules, warnings } = await loadCustomRules(dir, tempRootDirectory);
			expect(rules).toHaveLength(0);
			expect(warnings.length).toBeGreaterThan(0);
			expect(warnings.some((w) => w.includes("bad-syntax.ts"))).toBe(true);
		});
	});

	describe("empty directory", () => {
		it("returns warning when no rule files found", async () => {
			const dir = path.join(tempRootDirectory, "empty-dir");
			fs.mkdirSync(dir, { recursive: true });

			const { rules, warnings } = await loadCustomRules(dir, tempRootDirectory);
			expect(rules).toHaveLength(0);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain("No rule files");
		});
	});

	describe("non-existent directory", () => {
		it("returns warning for missing directory", async () => {
			const { rules, warnings } = await loadCustomRules(
				path.join(tempRootDirectory, "does-not-exist"),
				tempRootDirectory
			);
			expect(rules).toHaveLength(0);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain("not found");
		});
	});

	describe("multiple exports per file", () => {
		it("loads all valid rules from a single file", async () => {
			const dir = path.join(tempRootDirectory, "multi-export");
			fs.mkdirSync(dir, { recursive: true });
			fs.copyFileSync(
				path.join(fixturesDir, "multi-export.ts"),
				path.join(dir, "multi-export.ts")
			);

			const { rules, warnings } = await loadCustomRules(dir, tempRootDirectory);
			expect(rules).toHaveLength(2);
			expect(rules.map((r) => r.meta.id).sort()).toEqual([
				"custom/rule-one",
				"custom/rule-two",
			]);
			expect(warnings).toHaveLength(0);
		});
	});

	describe("category/severity validation", () => {
		let dir: string;

		beforeAll(() => {
			dir = path.join(tempRootDirectory, "bad-meta");
			fs.mkdirSync(dir, { recursive: true });
		});

		it("rejects rule with invalid category", async () => {
			const subDir = path.join(dir, "bad-category");
			fs.mkdirSync(subDir, { recursive: true });
			fs.writeFileSync(
				path.join(subDir, "bad-cat.ts"),
				`export const badCat = {
					meta: {
						id: "bad-cat",
						category: "invalid-category",
						severity: "error",
						description: "Bad category",
						help: "Fix category.",
					},
					check() {},
				};`
			);

			const { rules, warnings } = await loadCustomRules(
				subDir,
				tempRootDirectory
			);
			expect(rules).toHaveLength(0);
			expect(warnings.length).toBeGreaterThan(0);
		});

		it("rejects rule with invalid severity", async () => {
			const subDir = path.join(dir, "bad-severity");
			fs.mkdirSync(subDir, { recursive: true });
			fs.writeFileSync(
				path.join(subDir, "bad-sev.ts"),
				`export const badSev = {
					meta: {
						id: "bad-sev",
						category: "security",
						severity: "critical",
						description: "Bad severity",
						help: "Fix severity.",
					},
					check() {},
				};`
			);

			const { rules, warnings } = await loadCustomRules(
				subDir,
				tempRootDirectory
			);
			expect(rules).toHaveLength(0);
			expect(warnings.length).toBeGreaterThan(0);
		});
	});

	describe("relative path resolution", () => {
		it("resolves relative customRulesDir against projectRoot", async () => {
			const projectRoot = path.join(tempRootDirectory, "relative-test");
			const rulesDir = path.join(projectRoot, "my-rules");
			fs.mkdirSync(rulesDir, { recursive: true });
			fs.copyFileSync(
				path.join(fixturesDir, "valid-rule.ts"),
				path.join(rulesDir, "valid-rule.ts")
			);

			const { rules } = await loadCustomRules("my-rules", projectRoot);
			expect(rules).toHaveLength(1);
			expect(rules[0].meta.id).toBe("custom/no-console-log");
		});
	});

	describe("ignores non-rule files", () => {
		it("ignores files without .ts extension", async () => {
			const dir = path.join(tempRootDirectory, "mixed-files");
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(path.join(dir, "readme.md"), "# Rules");
			fs.writeFileSync(path.join(dir, "data.json"), "{}");
			fs.writeFileSync(path.join(dir, "ignored.js"), "export const x = 1;");
			fs.copyFileSync(
				path.join(fixturesDir, "valid-rule.ts"),
				path.join(dir, "valid-rule.ts")
			);

			const { rules } = await loadCustomRules(dir, tempRootDirectory);
			expect(rules).toHaveLength(1);
		});
	});
});
