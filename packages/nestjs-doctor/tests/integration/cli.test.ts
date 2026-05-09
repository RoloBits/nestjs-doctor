import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diagnoseMonorepo } from "../../src/api/index.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { detectMonorepo } from "../../src/engine/project-detector.js";
import {
	buildAnalysisContext,
	buildResult,
	diagnose,
	resolveScanConfig,
	scanMonorepo,
} from "../../src/engine/scanner.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

const COLLISION_FIXTURE_FILE_REGEX = /shared_in_file_[ab]\.ts$/;

function edgeContains(
	graph: ModuleGraph,
	fromName: string,
	toName: string
): boolean {
	const fromKey = graph.byName.get(fromName)?.[0]?.key;
	const toKey = graph.byName.get(toName)?.[0]?.key;
	if (!(fromKey && toKey)) {
		return false;
	}
	return graph.edges.get(fromKey)?.has(toKey) ?? false;
}

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

	describe("forward-ref cycle (issue #110)", () => {
		const fixtureRoot = resolve(FIXTURES, "false-positives/forward-ref-cycle");

		it("flags mutual forwardRef cycle by default (option not set)", async () => {
			const targetPath = resolve(fixtureRoot, "src");
			const scanConfig = await resolveScanConfig(targetPath);
			const context = await buildAnalysisContext(targetPath, scanConfig);
			const rawOutput = diagnose(context);
			const { result } = buildResult(
				context,
				rawOutput,
				scanConfig.customRuleWarnings
			);

			const cycleDiags = result.diagnostics.filter(
				(d) => d.rule === "architecture/no-circular-module-deps"
			);
			expect(cycleDiags.length).toBeGreaterThan(0);
		});

		it("does not flag mutual forwardRef cycle when ignoreForwardRefCycles is enabled in config", async () => {
			const targetPath = resolve(fixtureRoot, "src");
			const configPath = resolve(fixtureRoot, "nestjs-doctor.config.json");
			const scanConfig = await resolveScanConfig(targetPath, configPath);
			const context = await buildAnalysisContext(targetPath, scanConfig);
			const rawOutput = diagnose(context);
			const { result } = buildResult(
				context,
				rawOutput,
				scanConfig.customRuleWarnings
			);

			const cycleDiags = result.diagnostics.filter(
				(d) => d.rule === "architecture/no-circular-module-deps"
			);
			expect(cycleDiags).toHaveLength(0);
		});
	});

	it("attributes circular-deps diagnostics to the actual cycle files (issue #110)", async () => {
		const targetPath = resolve(
			FIXTURES,
			"false-positives/module-name-collision/src"
		);
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		const cycleDiags = result.diagnostics.filter(
			(d) => d.rule === "architecture/no-circular-module-deps"
		);
		expect(cycleDiags.length).toBeGreaterThan(0);

		// Each cycle is reported against a file that actually defines its members.
		// Before the fix, both cycle diagnostics landed on shared_in_file_b.ts
		// (the file that won the modules.set name collision), even when the cycle
		// involved AModule (declared only in shared_in_file_a.ts).
		for (const diag of cycleDiags) {
			expect(diag.filePath).toMatch(COLLISION_FIXTURE_FILE_REGEX);
		}
		const reportedFiles = new Set(cycleDiags.map((d) => d.filePath));
		expect(reportedFiles.size).toBe(2);
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
		const appHasModule = context.moduleGraph.byName.has("AppModule");
		const appModuleName = "AppModule";
		expect(appHasModule).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "ConfigModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "CacheModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "UsersModule")
		).toBe(true);
		expect(edgeContains(context.moduleGraph, appModuleName, "AuthModule")).toBe(
			true
		);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "DatabaseModule")
		).toBe(true);

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
		const appHasModule = context.moduleGraph.byName.has("AppModule");
		const appModuleName = "AppModule";
		expect(appHasModule).toBe(true);
		expect(edgeContains(context.moduleGraph, appModuleName, "AuthModule")).toBe(
			true
		);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "HealthModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "DatabaseModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "AdminModule")
		).toBe(true);

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
		const appHasModule = context.moduleGraph.byName.has("AppModule");
		const appModuleName = "AppModule";
		expect(appHasModule).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "ConfigModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "LoggerModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "HealthModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "DatabaseModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "AdminAuthModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "QueueModule")
		).toBe(true);

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

		// Clean score
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
		const appHasModule = context.moduleGraph.byName.has("AppModule");
		const appModuleName = "AppModule";
		expect(appHasModule).toBe(true);
		expect(edgeContains(context.moduleGraph, appModuleName, "AuthModule")).toBe(
			true
		);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "HealthModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "DatabaseModule")
		).toBe(true);
		expect(
			edgeContains(context.moduleGraph, appModuleName, "AdminModule")
		).toBe(true);

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

	describe("turborepo-app fixture", () => {
		it("detects Turborepo monorepo from pnpm-workspace.yaml", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app");
			const monorepo = await detectMonorepo(targetPath);
			expect(monorepo).not.toBeNull();
			expect(monorepo!.projects.size).toBe(4);
			expect(monorepo!.projects.has("api")).toBe(true);
			expect(monorepo!.projects.has("admin")).toBe(true);
			expect(monorepo!.projects.has("@acme/core")).toBe(true);
			expect(monorepo!.projects.has("@acme/db")).toBe(true);
		});

		it("scans all NestJS sub-projects in the monorepo", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app");
			const monorepo = await detectMonorepo(targetPath);
			expect(monorepo).not.toBeNull();

			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);
			const projectNames = monoResult.result.subProjects
				.map((p) => p.name)
				.sort();
			expect(projectNames).toEqual(["@acme/core", "@acme/db", "admin", "api"]);
			for (const sub of monoResult.result.subProjects) {
				expect(sub.result.project.fileCount).toBeGreaterThan(0);
			}
		});

		it("finds Prisma schema in packages/db sub-project", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const dbProject = monoResult.result.subProjects.find(
				(p) => p.name === "@acme/db"
			);
			expect(dbProject).toBeDefined();
			expect(dbProject!.result.project.orm).toBe("prisma");
			expect(dbProject!.result.schema.entities.length).toBe(3);

			const entityNames = dbProject!.result.schema.entities
				.map((e) => e.name)
				.sort();
			expect(entityNames).toEqual(["Order", "Product", "User"]);

			// Check relations exist
			const hasRelations = dbProject!.result.schema.entities.some(
				(e) => e.relations && e.relations.length > 0
			);
			expect(hasRelations).toBe(true);
		});

		it("detects ORM and framework per app", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const api = monoResult.result.subProjects.find((p) => p.name === "api");
			expect(api!.result.project.orm).toBe("prisma");
			expect(api!.result.project.framework).toBe("express");

			const admin = monoResult.result.subProjects.find(
				(p) => p.name === "admin"
			);
			expect(admin!.result.project.orm).toBeNull();
			expect(admin!.result.project.framework).toBe("express");
		});

		it("builds correct module graph per app", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const api = monoResult.result.subProjects.find((p) => p.name === "api");
			expect(api!.result.project.moduleCount).toBeGreaterThanOrEqual(3);

			const admin = monoResult.result.subProjects.find(
				(p) => p.name === "admin"
			);
			expect(admin!.result.project.moduleCount).toBe(2);
		});

		it("produces valid combined monorepo result", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const subFileSum = monoResult.result.subProjects.reduce(
				(sum, p) => sum + p.result.project.fileCount,
				0
			);
			expect(monoResult.result.combined.project.fileCount).toBe(subFileSum);

			const subModuleSum = monoResult.result.subProjects.reduce(
				(sum, p) => sum + p.result.project.moduleCount,
				0
			);
			expect(monoResult.result.combined.project.moduleCount).toBe(subModuleSum);
		});

		it("merges sub-project schemas into combined result", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const combined = monoResult.result.combined;

			// combined.schema should exist because @acme/db has Prisma entities
			expect(combined.schema).toBeDefined();
			expect(combined.schema!.orm).toBe("prisma");

			// Should contain all 3 entities from packages/db: User, Product, Order
			const entityNames = combined.schema!.entities.map((e) => e.name).sort();
			expect(entityNames).toEqual(["Order", "Product", "User"]);

			// Should contain the relations from packages/db
			expect(combined.schema!.relations.length).toBeGreaterThan(0);
		});

		it("resolves @app/* path aliases within api app", async () => {
			const targetPath = resolve(FIXTURES, "turborepo-app/apps/api/src");
			const scanConfig = await resolveScanConfig(targetPath);
			const context = await buildAnalysisContext(targetPath, scanConfig);

			expect(context.pathAliases.size).toBeGreaterThan(0);
			expect(context.pathAliases.has("@app/*")).toBe(true);
		});
	});

	describe("yarn-workspace-app fixture", () => {
		it("scans only NestJS sub-projects", async () => {
			const targetPath = resolve(FIXTURES, "yarn-workspace-app");
			const monorepo = await detectMonorepo(targetPath);
			expect(monorepo).not.toBeNull();

			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			expect(monoResult.result.isMonorepo).toBe(true);
			const projectNames = monoResult.result.subProjects
				.map((p) => p.name)
				.sort();
			expect(projectNames).toEqual(["@ever/api"]);
		});

		it("scans files and produces a valid combined result", async () => {
			const targetPath = resolve(FIXTURES, "yarn-workspace-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			for (const sub of monoResult.result.subProjects) {
				expect(sub.result.project.fileCount).toBeGreaterThan(0);
			}

			const subFileSum = monoResult.result.subProjects.reduce(
				(sum, p) => sum + p.result.project.fileCount,
				0
			);
			expect(monoResult.result.combined.project.fileCount).toBe(subFileSum);
		});

		it("detects framework for the api sub-project", async () => {
			const targetPath = resolve(FIXTURES, "yarn-workspace-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const api = monoResult.result.subProjects.find(
				(p) => p.name === "@ever/api"
			);
			expect(api!.result.project.framework).toBe("express");
		});
	});

	describe("nx-app fixture", () => {
		it("scans only NestJS sub-projects", async () => {
			const targetPath = resolve(FIXTURES, "nx-app");
			const monorepo = await detectMonorepo(targetPath);
			expect(monorepo).not.toBeNull();

			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			expect(monoResult.result.isMonorepo).toBe(true);
			const projectNames = monoResult.result.subProjects
				.map((p) => p.name)
				.sort();
			expect(projectNames).toEqual(["@nx/api", "@nx/shared"]);
		});

		it("scans files and produces a valid combined result", async () => {
			const targetPath = resolve(FIXTURES, "nx-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			for (const sub of monoResult.result.subProjects) {
				expect(sub.result.project.fileCount).toBeGreaterThan(0);
			}

			const subFileSum = monoResult.result.subProjects.reduce(
				(sum, p) => sum + p.result.project.fileCount,
				0
			);
			expect(monoResult.result.combined.project.fileCount).toBe(subFileSum);
		});

		it("excludes non-NestJS dashboard app", async () => {
			const targetPath = resolve(FIXTURES, "nx-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const names = monoResult.result.subProjects.map((p) => p.name);
			expect(names).not.toContain("@nx/dashboard");
		});
	});

	describe("lerna-standalone-app fixture", () => {
		it("scans only NestJS sub-projects", async () => {
			const targetPath = resolve(FIXTURES, "lerna-standalone-app");
			const monorepo = await detectMonorepo(targetPath);
			expect(monorepo).not.toBeNull();

			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			expect(monoResult.result.isMonorepo).toBe(true);
			const projectNames = monoResult.result.subProjects
				.map((p) => p.name)
				.sort();
			expect(projectNames).toEqual(["@lerna/api"]);
		});

		it("scans files and produces a valid combined result", async () => {
			const targetPath = resolve(FIXTURES, "lerna-standalone-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			for (const sub of monoResult.result.subProjects) {
				expect(sub.result.project.fileCount).toBeGreaterThan(0);
			}

			const subFileSum = monoResult.result.subProjects.reduce(
				(sum, p) => sum + p.result.project.fileCount,
				0
			);
			expect(monoResult.result.combined.project.fileCount).toBe(subFileSum);
		});

		it("excludes non-NestJS frontend package", async () => {
			const targetPath = resolve(FIXTURES, "lerna-standalone-app");
			const monorepo = await detectMonorepo(targetPath);
			const scanConfig = await resolveScanConfig(targetPath);
			const monoResult = await scanMonorepo(targetPath, scanConfig, monorepo!);

			const names = monoResult.result.subProjects.map((p) => p.name);
			expect(names).not.toContain("@lerna/frontend");
		});
	});

	it("detects all correctness rule violations in bad-correctness fixture", async () => {
		const targetPath = resolve(FIXTURES, "bad-correctness/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		expect(result.diagnostics.length).toBeGreaterThan(0);

		for (const ruleId of [
			"correctness/param-decorator-matches-route",
			"correctness/factory-inject-matches-params",
			"correctness/validated-non-primitive-needs-type",
			"correctness/no-duplicate-decorators",
			"correctness/validate-nested-array-each",
			"correctness/injectable-must-be-provided",
		]) {
			const diags = result.diagnostics.filter((d) => d.rule === ruleId);
			expect(
				diags.length,
				`Expected at least 1 diagnostic for ${ruleId}`
			).toBeGreaterThan(0);
		}
	});

	it("detects security rule violations in bad-security fixture", async () => {
		const targetPath = resolve(FIXTURES, "bad-security/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		expect(result.diagnostics.length).toBeGreaterThan(0);

		const diags = result.diagnostics.filter(
			(d) => d.rule === "security/require-guards-on-endpoints"
		);
		expect(
			diags.length,
			"Expected at least 1 diagnostic for security/require-guards-on-endpoints"
		).toBeGreaterThan(0);
	});

	it("does not flag self-activating providers in bad-performance fixture", async () => {
		const targetPath = resolve(FIXTURES, "bad-performance/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		const unusedDiags = result.diagnostics.filter(
			(d) => d.rule === "performance/no-unused-providers"
		);

		// HealthCron should NOT be flagged (has @Cron decorator)
		expect(
			unusedDiags.filter((d) => d.message.includes("HealthCron"))
		).toHaveLength(0);

		// HealthService should NOT be flagged (injected by HealthCron)
		expect(
			unusedDiags.filter((d) => d.message.includes("HealthService"))
		).toHaveLength(0);

		// UnusedService SHOULD be flagged
		expect(
			unusedDiags.filter((d) => d.message.includes("UnusedService"))
		).toHaveLength(1);
	});

	it("does not flag migration identifiers as secrets in false-positives fixture", async () => {
		const targetPath = resolve(FIXTURES, "false-positives/src");
		const scanConfig = await resolveScanConfig(targetPath);
		const context = await buildAnalysisContext(targetPath, scanConfig);
		const rawOutput = diagnose(context);
		const { result } = buildResult(
			context,
			rawOutput,
			scanConfig.customRuleWarnings
		);

		const secretDiags = result.diagnostics.filter(
			(d) => d.rule === "security/no-hardcoded-secrets"
		);
		expect(secretDiags).toHaveLength(0);
		expect(result.diagnostics).toHaveLength(0);
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

			const appHasModule = context.moduleGraph.byName.has("AppModule");
			const appModuleName = "AppModule";
			expect(appHasModule).toBe(true);
			expect(
				edgeContains(context.moduleGraph, appModuleName, "DatabaseModule")
			).toBe(true);
			expect(
				edgeContains(context.moduleGraph, appModuleName, "UsersModule")
			).toBe(true);
			expect(
				edgeContains(context.moduleGraph, appModuleName, "ProductsModule")
			).toBe(true);
			expect(
				edgeContains(context.moduleGraph, appModuleName, "OrdersModule")
			).toBe(true);
		});

		it("excludes config files from the scan", () => {
			const configFiles = context.files.filter((f) => f.endsWith(".config.ts"));
			expect(configFiles).toHaveLength(0);
		});
	});
});
