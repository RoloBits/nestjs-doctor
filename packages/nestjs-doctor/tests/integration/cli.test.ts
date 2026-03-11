import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

	it("excludes config files from the scan", async () => {
		const targetPath = resolve(FIXTURES, "basic-app/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);

		const configFiles = context.files.filter((f) => f.endsWith(".config.ts"));
		expect(configFiles).toHaveLength(0);

		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);
		expect(result.diagnostics).toHaveLength(0);
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

	it("resolves dynamic module imports in module graph", async () => {
		const targetPath = resolve(FIXTURES, "dynamic-modules/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Should detect all 6 modules
		expect(result.project.moduleCount).toBe(6);

		// AppModule should have edges to all 5 imported modules
		const appEdges = context.moduleGraph.edges.get("AppModule");
		expect(appEdges).toBeDefined();
		expect(appEdges?.has("ConfigModule")).toBe(true);
		expect(appEdges?.has("CacheModule")).toBe(true);
		expect(appEdges?.has("UsersModule")).toBe(true);
		expect(appEdges?.has("AuthModule")).toBe(true);
		expect(appEdges?.has("DatabaseModule")).toBe(true);

		// Should be a clean result with no diagnostics
		expect(result.score.value).toBeGreaterThanOrEqual(90);
	});

	it("produces no false circular deps from dynamic imports", async () => {
		const targetPath = resolve(FIXTURES, "dynamic-modules/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Dynamic imports (forRoot, spread, forwardRef) should not produce false circular deps
		const circularDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-circular-module-deps"
		);
		expect(circularDiags).toHaveLength(0);
	});

	it("resolves cross-file function calls in module graph", async () => {
		const targetPath = resolve(FIXTURES, "cross-file-imports/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Should detect 5 modules: AppModule, AuthModule, HealthModule, DatabaseModule, AdminModule
		expect(result.project.moduleCount).toBe(5);

		// AppModule should have edges to all 4 imported modules
		const appEdges = context.moduleGraph.edges.get("AppModule");
		expect(appEdges).toBeDefined();
		expect(appEdges?.has("AuthModule")).toBe(true);
		expect(appEdges?.has("HealthModule")).toBe(true);
		expect(appEdges?.has("DatabaseModule")).toBe(true);
		expect(appEdges?.has("AdminModule")).toBe(true);

		// No false circular deps
		const circularDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-circular-module-deps"
		);
		expect(circularDiags).toHaveLength(0);

		// Clean score
		expect(result.score.value).toBeGreaterThanOrEqual(90);
	});

	it("resolves cross-file monorepo-style chained imports in module graph", async () => {
		const targetPath = resolve(FIXTURES, "cross-file-monorepo/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Should detect 7 modules: AppModule + 6 imported
		expect(result.project.moduleCount).toBe(7);

		// AppModule should have edges to all 6 imported modules
		const appEdges = context.moduleGraph.edges.get("AppModule");
		expect(appEdges).toBeDefined();
		expect(appEdges?.has("ConfigModule")).toBe(true);
		expect(appEdges?.has("LoggerModule")).toBe(true);
		expect(appEdges?.has("HealthModule")).toBe(true);
		expect(appEdges?.has("DatabaseModule")).toBe(true);
		expect(appEdges?.has("AdminAuthModule")).toBe(true);
		expect(appEdges?.has("QueueModule")).toBe(true);

		// No false circular deps
		const circularDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-circular-module-deps"
		);
		expect(circularDiags).toHaveLength(0);

		// No orphan modules
		const orphanDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-orphan-modules"
		);
		expect(orphanDiags).toHaveLength(0);

		// Clean score with zero diagnostics
		expect(result.score.value).toBeGreaterThanOrEqual(90);
		expect(result.diagnostics).toHaveLength(0);
	});

	it("resolves cross-file imports via tsconfig path aliases", async () => {
		const targetPath = resolve(FIXTURES, "cross-file-path-aliases/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		// Should detect 5 modules: AppModule, AuthModule, HealthModule, DatabaseModule, AdminModule
		expect(result.project.moduleCount).toBe(5);

		// AppModule should have edges to all 4 imported modules (resolved via path aliases)
		const appEdges = context.moduleGraph.edges.get("AppModule");
		expect(appEdges).toBeDefined();
		expect(appEdges?.has("AuthModule")).toBe(true);
		expect(appEdges?.has("HealthModule")).toBe(true);
		expect(appEdges?.has("DatabaseModule")).toBe(true);
		expect(appEdges?.has("AdminModule")).toBe(true);

		// No false circular deps
		const circularDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-circular-module-deps"
		);
		expect(circularDiags).toHaveLength(0);

		// Path aliases loaded correctly
		expect(context.pathAliases.size).toBeGreaterThan(0);
		expect(context.pathAliases.has("@app/*")).toBe(true);
		expect(context.pathAliases.has("@shared/*")).toBe(true);
	});

	describe("nested node_modules exclusion", () => {
		const nestedDir = resolve(
			FIXTURES,
			"basic-app/src/lib/node_modules/some-pkg"
		);
		const nestedFile = resolve(nestedDir, "index.ts");

		beforeAll(() => {
			mkdirSync(nestedDir, { recursive: true });
			writeFileSync(nestedFile, "export class Foo {}\n");
		});

		afterAll(() => {
			rmSync(resolve(FIXTURES, "basic-app/src/lib"), {
				recursive: true,
				force: true,
			});
		});

		it("excludes .ts files inside nested node_modules", async () => {
			const targetPath = resolve(FIXTURES, "basic-app/src");
			const scanConfig = await resolveScanConfig(targetPath);
			const context = await buildAnalysisContext(targetPath, scanConfig);

			expect(existsSync(nestedFile)).toBe(true);
			expect(
				context.files.filter((f) => f.includes("node_modules"))
			).toHaveLength(0);
		});
	});

	it("diagnoseMonorepo falls back to single scan for non-monorepo", async () => {
		const targetPath = resolve(FIXTURES, "basic-app/src");
		const result = await diagnoseMonorepo(targetPath);

		expect(result.isMonorepo).toBe(false);
		expect(result.subProjects.length).toBe(1);
		expect(result.subProjects[0].name).toBe("default");
	});

	describe("drizzle-app fixture", () => {
		const targetPath = resolve(FIXTURES, "drizzle-app");
		let context: Awaited<ReturnType<typeof buildAnalysisContext>>;
		let result: Awaited<ReturnType<typeof buildResult>>["result"];

		beforeAll(async () => {
			const scanConfig = await resolveScanConfig(targetPath);
			context = await buildAnalysisContext(targetPath, scanConfig);
			const rawOutput = diagnose(context);
			({ result } = buildResult(
				context,
				rawOutput,
				scanConfig.customRuleWarnings
			));
		});

		it("detects Drizzle ORM and extracts schema", () => {
			expect(result.project.orm).toBe("drizzle");
			expect(result.schema).toBeDefined();
			expect(result.schema!.entities).toHaveLength(9);
			expect(result.schema!.relations).toHaveLength(10);
			expect(result.schema!.orm).toBe("drizzle");
		});

		it("fires exactly 4 schema diagnostics", () => {
			const schemaDiags = result.diagnostics.filter(
				(d) => d.category === "schema"
			);
			expect(schemaDiags).toHaveLength(4);

			const pkDiags = schemaDiags.filter(
				(d) => d.rule === "schema/require-primary-key"
			);
			expect(pkDiags).toHaveLength(1);
			expect(pkDiags[0].entity).toBe("auditLogs");

			const tsDiags = schemaDiags.filter(
				(d) => d.rule === "schema/require-timestamps"
			);
			expect(tsDiags).toHaveLength(2);
			const tsEntities = tsDiags.map((d) => d.entity).sort();
			expect(tsEntities).toEqual(["auditLogs", "notifications"]);

			const cascadeDiags = schemaDiags.filter(
				(d) => d.rule === "schema/require-cascade-rule"
			);
			expect(cascadeDiags).toHaveLength(1);
			expect(cascadeDiags[0].entity).toBe("notifications");
		});

		it("builds correct module graph", () => {
			expect(result.project.moduleCount).toBe(5);

			const appEdges = context.moduleGraph.edges.get("AppModule");
			expect(appEdges).toBeDefined();
			expect(appEdges?.has("DatabaseModule")).toBe(true);
			expect(appEdges?.has("UsersModule")).toBe(true);
			expect(appEdges?.has("ProductsModule")).toBe(true);
			expect(appEdges?.has("OrdersModule")).toBe(true);
		});

		it("excludes config files from the scan", () => {
			const configFiles = context.files.filter((f) => f.endsWith(".config.ts"));
			expect(configFiles).toHaveLength(0);
		});
	});
});
