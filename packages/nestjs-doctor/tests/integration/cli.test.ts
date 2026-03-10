import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseMonorepo } from "../../src/api/index.js";
import { detectMonorepo } from "../../src/engine/project-detector.js";
import {
	buildAnalysisContext,
	buildResult,
	diagnose,
	resolveScanConfig,
	scanMonorepo,
} from "../../src/engine/scanner.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("scanner integration", () => {
	it("produces a clean result for basic-app", async () => {
		const targetPath = resolve(FIXTURES, "basic-app/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		expect(result.score.value).toBeGreaterThanOrEqual(90);
		expect(result.score.label).toBe("Excellent");
		expect(result.diagnostics).toHaveLength(0);
		expect(result.project.fileCount).toBeGreaterThan(0);
	});

	it("detects violations in bad-practices fixture", async () => {
		const targetPath = resolve(FIXTURES, "bad-practices/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

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
		const targetPath = resolve(FIXTURES, "bad-practices/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		expect(result.summary).toHaveProperty("total");
		expect(result.summary).toHaveProperty("errors");
		expect(result.summary).toHaveProperty("warnings");
		expect(result.summary).toHaveProperty("info");
		expect(result.summary).toHaveProperty("byCategory");
		expect(result.summary.total).toBe(
			result.summary.errors + result.summary.warnings + result.summary.info
		);
	});

	it("summary counts match actual diagnostics array", async () => {
		const targetPath = resolve(FIXTURES, "bad-practices/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		expect(result.summary.total).toBe(result.diagnostics.length);

		const countByCategory: Record<string, number> = {};
		for (const d of result.diagnostics) {
			countByCategory[d.category] = (countByCategory[d.category] || 0) + 1;
		}

		for (const [cat, count] of Object.entries(result.summary.byCategory)) {
			expect(count).toBe(countByCategory[cat] || 0);
		}
	});

	it("returns valid project info", async () => {
		const targetPath = resolve(FIXTURES, "bad-practices/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		expect(result.project).toHaveProperty("fileCount");
		expect(result.project.fileCount).toBeGreaterThan(0);
	});

	it("detects architecture violations in bad-architecture fixture", async () => {
		const targetPath = resolve(FIXTURES, "bad-architecture/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

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
		const targetPath = resolve(FIXTURES, "bad-architecture/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Should detect 3 modules: AppModule, UsersModule, OrdersModule
		expect(result.project.moduleCount).toBe(3);
	});

	it("scans monorepo with multiple sub-projects", async () => {
		const targetPath = resolve(FIXTURES, "monorepo-app");
		const scanConfig = await resolveScanConfig(targetPath);
		const monorepo = await detectMonorepo(targetPath);
		expect(monorepo).not.toBeNull();
		const { result } = await scanMonorepo(targetPath, scanConfig, monorepo!);

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

	it("fires barrel-export and hardcoded-secrets rules without config", async () => {
		const targetPath = resolve(FIXTURES, "config-disable-rules/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		const barrelDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-barrel-export-internals"
		);
		expect(barrelDiags.length).toBeGreaterThan(0);

		const secretDiags = result.diagnostics.filter(
			(d) => d.rule === "security/no-hardcoded-secrets"
		);
		expect(secretDiags.length).toBeGreaterThan(0);
	});

	it("disables both rules when config sets them to false", async () => {
		const targetPath = resolve(FIXTURES, "config-disable-rules/src");
		const configPath = resolve(
			FIXTURES,
			"config-disable-rules/nestjs-doctor.config.json"
		);
		const scanConfig = await resolveScanConfig(targetPath, configPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		const barrelDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-barrel-export-internals"
		);
		expect(barrelDiags).toHaveLength(0);

		const secretDiags = result.diagnostics.filter(
			(d) => d.rule === "security/no-hardcoded-secrets"
		);
		expect(secretDiags).toHaveLength(0);
	});

	it("produces a clean result for graphql-app (resolvers are implicit injectables)", async () => {
		const targetPath = resolve(FIXTURES, "graphql-app/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Should NOT flag @Resolver as missing @Injectable
		expect(
			result.diagnostics.filter(
				(d) => d.rule === "correctness/no-missing-injectable"
			)
		).toHaveLength(0);

		// Should NOT flag resolver constructor params
		expect(
			result.diagnostics.filter(
				(d) => d.rule === "correctness/require-inject-decorator"
			)
		).toHaveLength(0);

		// Should NOT flag RecipesService as unused (it's injected by the resolver)
		expect(
			result.diagnostics.filter(
				(d) => d.rule === "performance/no-unused-providers"
			)
		).toHaveLength(0);

		// Overall clean
		expect(result.score.value).toBeGreaterThanOrEqual(90);
		expect(result.diagnostics).toHaveLength(0);
	});

	it("counts modules correctly in graphql-app", async () => {
		const targetPath = resolve(FIXTURES, "graphql-app/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Should detect 3 modules: AppModule, RecipesModule, PostsModule
		expect(result.project.moduleCount).toBe(3);
	});

	it("diagnoseMonorepo falls back to single scan for non-monorepo", async () => {
		const targetPath = resolve(FIXTURES, "basic-app/src");
		const result = await diagnoseMonorepo(targetPath);

		expect(result.isMonorepo).toBe(false);
		expect(result.subProjects.length).toBe(1);
		expect(result.subProjects[0].name).toBe("default");
	});
});
