import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { scan } from "../../src/core/scanner.js";

const exec = promisify(execFile);
const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("scanner integration", () => {
	it("produces a clean result for basic-app", async () => {
		const result = await scan(resolve(FIXTURES, "basic-app/src"));

		expect(result.score.value).toBeGreaterThanOrEqual(90);
		expect(result.score.label).toBe("Excellent");
		expect(result.diagnostics).toHaveLength(0);
		expect(result.project.fileCount).toBeGreaterThan(0);
	});

	it("detects violations in bad-practices fixture", async () => {
		const result = await scan(resolve(FIXTURES, "bad-practices/src"));

		expect(result.diagnostics.length).toBeGreaterThan(0);
		expect(result.score.value).toBeLessThan(100);

		// Should find readonly violations
		const readonlyDiags = result.diagnostics.filter((d) =>
			d.rule === "correctness/prefer-readonly-injection",
		);
		expect(readonlyDiags.length).toBeGreaterThan(0);

		// Should find repository-in-controller violations
		const repoDiags = result.diagnostics.filter((d) =>
			d.rule === "architecture/no-repository-in-controllers",
		);
		expect(repoDiags.length).toBeGreaterThan(0);

		// Should find hardcoded secrets
		const secretDiags = result.diagnostics.filter((d) =>
			d.rule === "security/no-hardcoded-secrets",
		);
		expect(secretDiags.length).toBeGreaterThan(0);
	});

	it("returns valid summary structure", async () => {
		const result = await scan(resolve(FIXTURES, "bad-practices/src"));

		expect(result.summary).toHaveProperty("total");
		expect(result.summary).toHaveProperty("errors");
		expect(result.summary).toHaveProperty("warnings");
		expect(result.summary).toHaveProperty("info");
		expect(result.summary).toHaveProperty("byCategory");
		expect(result.summary.total).toBe(
			result.summary.errors + result.summary.warnings + result.summary.info,
		);
	});

	it("returns valid project info", async () => {
		const result = await scan(resolve(FIXTURES, "bad-practices/src"));

		expect(result.project).toHaveProperty("fileCount");
		expect(result.project.fileCount).toBeGreaterThan(0);
	});
});
