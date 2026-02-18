import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scan, scanMonorepo } from "../../src/core/scanner.js";

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
		const readonlyDiags = result.diagnostics.filter(
			(d) => d.rule === "correctness/prefer-readonly-injection"
		);
		expect(readonlyDiags.length).toBeGreaterThan(0);

		// Should find repository-in-controller violations
		const repoDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-repository-in-controllers"
		);
		expect(repoDiags.length).toBeGreaterThan(0);

		// Should find hardcoded secrets
		const secretDiags = result.diagnostics.filter(
			(d) => d.rule === "security/no-hardcoded-secrets"
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
			result.summary.errors + result.summary.warnings + result.summary.info
		);
	});

	it("returns valid project info", async () => {
		const result = await scan(resolve(FIXTURES, "bad-practices/src"));

		expect(result.project).toHaveProperty("fileCount");
		expect(result.project.fileCount).toBeGreaterThan(0);
	});

	it("detects architecture violations in bad-architecture fixture", async () => {
		const result = await scan(resolve(FIXTURES, "bad-architecture/src"));

		expect(result.diagnostics.length).toBeGreaterThan(0);

		// Should find circular module dependencies
		const circularDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-circular-module-deps"
		);
		expect(circularDiags.length).toBeGreaterThan(0);

		// Should find ORM in controllers
		const ormControllerDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-orm-in-controllers"
		);
		expect(ormControllerDiags.length).toBeGreaterThan(0);

		// Should find business logic in controllers
		const bizLogicDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-business-logic-in-controllers"
		);
		expect(bizLogicDiags.length).toBeGreaterThan(0);

		// Should find manual instantiation
		const manualInstDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-manual-instantiation"
		);
		expect(manualInstDiags.length).toBeGreaterThan(0);
	});

	it("counts modules correctly via module graph", async () => {
		const result = await scan(resolve(FIXTURES, "bad-architecture/src"));

		// Should detect 3 modules: AppModule, UsersModule, OrdersModule
		expect(result.project.moduleCount).toBe(3);
	});

	it("scans monorepo with multiple sub-projects", async () => {
		const result = await scanMonorepo(resolve(FIXTURES, "monorepo-app"));

		expect(result.isMonorepo).toBe(true);
		expect(result.subProjects.length).toBe(2);

		const projectNames = result.subProjects.map((sp) => sp.name).sort();
		expect(projectNames).toEqual(["admin", "api"]);

		// Each sub-project should have scanned files
		for (const sp of result.subProjects) {
			expect(sp.result.project.fileCount).toBeGreaterThan(0);
		}

		// Combined result should aggregate
		expect(result.combined.project.fileCount).toBe(
			result.subProjects.reduce(
				(sum, sp) => sum + sp.result.project.fileCount,
				0
			)
		);
	});

	it("falls back to single scan for non-monorepo", async () => {
		const result = await scanMonorepo(resolve(FIXTURES, "basic-app/src"));

		expect(result.isMonorepo).toBe(false);
		expect(result.subProjects.length).toBe(1);
		expect(result.subProjects[0].name).toBe("default");
	});
});
