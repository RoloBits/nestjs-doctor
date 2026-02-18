import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createAstParser } from "../engine/ast-parser.js";
import { buildModuleGraph } from "../engine/module-graph.js";
import { runRules } from "../engine/rule-runner.js";
import { resolveProviders } from "../engine/type-resolver.js";
import { allRules } from "../rules/index.js";
import { calculateScore } from "../scorer/index.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type { Diagnostic } from "../types/diagnostic.js";
import type {
	DiagnoseResult,
	DiagnoseSummary,
	MonorepoResult,
	SubProjectResult,
} from "../types/result.js";
import { loadConfig } from "./config-loader.js";
import { collectFiles, collectMonorepoFiles } from "./file-collector.js";
import { filterIgnoredDiagnostics } from "./filter-diagnostics.js";
import { detectMonorepo, detectProject } from "./project-detector.js";

export async function scan(
	targetPath: string,
	options: { config?: string } = {}
): Promise<DiagnoseResult> {
	const startTime = performance.now();

	const config = await loadConfig(targetPath, options.config);
	const project = await detectProject(targetPath);
	const files = await collectFiles(targetPath, config);

	project.fileCount = files.length;

	const astProject = createAstParser(files);
	const moduleGraph = buildModuleGraph(astProject, files);
	const providers = resolveProviders(astProject, files);
	const rules = filterRules(config);
	const rawDiagnostics = runRules(astProject, files, rules, {
		moduleGraph,
		providers,
		config,
	});
	const diagnostics = filterIgnoredDiagnostics(rawDiagnostics, config);

	project.moduleCount = moduleGraph.modules.size;

	const score = calculateScore(diagnostics, files.length);
	const summary = buildSummary(diagnostics);
	const elapsedMs = performance.now() - startTime;

	return { score, diagnostics, project, summary, elapsedMs };
}

function filterRules(config: NestjsDoctorConfig) {
	return allRules.filter((rule) => {
		const ruleConfig = config.rules?.[rule.meta.id];
		if (ruleConfig === false) {
			return false;
		}
		if (typeof ruleConfig === "object" && ruleConfig.enabled === false) {
			return false;
		}

		const categoryEnabled = config.categories?.[rule.meta.category];
		if (categoryEnabled === false) {
			return false;
		}

		return true;
	});
}

export async function scanMonorepo(
	targetPath: string,
	options: { config?: string } = {}
): Promise<MonorepoResult> {
	const startTime = performance.now();
	const monorepo = await detectMonorepo(targetPath);

	if (!monorepo) {
		// Not a monorepo — scan as single project and wrap result
		const result = await scan(targetPath, options);
		return {
			isMonorepo: false,
			subProjects: [{ name: "default", result }],
			combined: result,
			elapsedMs: result.elapsedMs,
		};
	}

	const config = await loadConfig(targetPath, options.config);
	const filesByProject = await collectMonorepoFiles(
		targetPath,
		monorepo,
		config
	);

	const subProjects: SubProjectResult[] = [];
	const allDiagnostics: Diagnostic[] = [];
	let totalFiles = 0;

	for (const [name, files] of filesByProject) {
		if (files.length === 0) {
			continue;
		}

		const projectPath = join(targetPath, monorepo.projects.get(name)!);
		const project = await detectProject(projectPath);
		project.fileCount = files.length;

		const astProject = createAstParser(files);
		const moduleGraph = buildModuleGraph(astProject, files);
		const providers = resolveProviders(astProject, files);
		const rules = filterRules(config);
		const rawDiagnostics = runRules(astProject, files, rules, {
			moduleGraph,
			providers,
			config,
		});
		const diagnostics = filterIgnoredDiagnostics(rawDiagnostics, config);

		project.moduleCount = moduleGraph.modules.size;

		const score = calculateScore(diagnostics, files.length);
		const summary = buildSummary(diagnostics);

		const result: DiagnoseResult = {
			score,
			diagnostics,
			project,
			summary,
			elapsedMs: 0,
		};

		subProjects.push({ name, result });
		allDiagnostics.push(...diagnostics);
		totalFiles += files.length;
	}

	const combinedScore = calculateScore(allDiagnostics, totalFiles);
	const combinedSummary = buildSummary(allDiagnostics);
	const elapsedMs = performance.now() - startTime;

	const combined: DiagnoseResult = {
		score: combinedScore,
		diagnostics: allDiagnostics,
		project: {
			name: "monorepo",
			nestVersion: subProjects[0]?.result.project.nestVersion ?? null,
			orm: subProjects[0]?.result.project.orm ?? null,
			framework: subProjects[0]?.result.project.framework ?? null,
			fileCount: totalFiles,
			moduleCount: subProjects.reduce(
				(sum, sp) => sum + sp.result.project.moduleCount,
				0
			),
		},
		summary: combinedSummary,
		elapsedMs,
	};

	return {
		isMonorepo: true,
		subProjects,
		combined,
		elapsedMs,
	};
}

function buildSummary(
	diagnostics: DiagnoseResult["diagnostics"]
): DiagnoseSummary {
	return {
		total: diagnostics.length,
		errors: diagnostics.filter((d) => d.severity === "error").length,
		warnings: diagnostics.filter((d) => d.severity === "warning").length,
		info: diagnostics.filter((d) => d.severity === "info").length,
		byCategory: {
			security: diagnostics.filter((d) => d.category === "security").length,
			performance: diagnostics.filter((d) => d.category === "performance")
				.length,
			correctness: diagnostics.filter((d) => d.category === "correctness")
				.length,
			architecture: diagnostics.filter((d) => d.category === "architecture")
				.length,
		},
	};
}
