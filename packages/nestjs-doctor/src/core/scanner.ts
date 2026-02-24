import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createAstParser } from "../engine/ast-parser.js";
import { buildModuleGraph, type ModuleGraph } from "../engine/module-graph.js";
import { runRules } from "../engine/rule-runner.js";
import type { ProviderInfo } from "../engine/type-resolver.js";
import { resolveProviders } from "../engine/type-resolver.js";
import { allRules } from "../rules/index.js";
import type { AnyRule } from "../rules/types.js";
import { calculateScore } from "../scorer/index.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type { Diagnostic } from "../types/diagnostic.js";
import type {
	DiagnoseResult,
	DiagnoseSummary,
	MonorepoResult,
	RuleErrorInfo,
	SubProjectResult,
} from "../types/result.js";
import { loadConfig } from "./config-loader.js";
import { collectFiles, collectMonorepoFiles } from "./file-collector.js";
import { filterIgnoredDiagnostics } from "./filter-diagnostics.js";
import { detectMonorepo, detectProject } from "./project-detector.js";
import { mergeRules, resolveCustomRules } from "./rule-resolver.js";

function formatRuleError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export interface ScanOptions {
	config?: string;
}

export interface ScanResult {
	customRuleWarnings: string[];
	files: string[];
	moduleGraph: ModuleGraph;
	providers: Map<string, ProviderInfo>;
	result: DiagnoseResult;
}

export interface MonorepoScanResult {
	customRuleWarnings: string[];
	moduleGraphs: Map<string, ModuleGraph>;
	result: MonorepoResult;
}

export async function scan(
	targetPath: string,
	options: ScanOptions = {}
): Promise<ScanResult> {
	const startTime = performance.now();

	const config = await loadConfig(targetPath, options.config);
	const { rules: customRules, warnings: customRuleWarnings } =
		await resolveCustomRules(config, targetPath);
	const combinedRules = mergeRules(allRules, customRules, customRuleWarnings);

	const project = await detectProject(targetPath);
	const files = await collectFiles(targetPath, config);
	const astProject = createAstParser(files);
	const moduleGraph = buildModuleGraph(astProject, files);
	const providers = resolveProviders(astProject, files);
	const rules = filterRules(config, combinedRules);
	const { diagnostics: rawDiagnostics, errors } = runRules(
		astProject,
		files,
		rules,
		{ moduleGraph, providers, config }
	);
	const diagnostics = filterIgnoredDiagnostics(
		rawDiagnostics,
		config,
		targetPath
	);

	const score = calculateScore(diagnostics, files.length);
	const summary = buildSummary(diagnostics);
	const ruleErrors: RuleErrorInfo[] = errors.map((e) => ({
		ruleId: e.ruleId,
		error: formatRuleError(e.error),
	}));
	const elapsedMs = performance.now() - startTime;

	const result: DiagnoseResult = {
		score,
		diagnostics,
		project: {
			...project,
			fileCount: files.length,
			moduleCount: moduleGraph.modules.size,
		},
		summary,
		ruleErrors,
		elapsedMs,
	};

	return { result, moduleGraph, customRuleWarnings, files, providers };
}

function filterRules(config: NestjsDoctorConfig, rules: AnyRule[]) {
	return rules.filter((rule) => {
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
	options: ScanOptions = {}
): Promise<MonorepoScanResult> {
	const startTime = performance.now();
	const monorepo = await detectMonorepo(targetPath);

	if (!monorepo) {
		const { result, moduleGraph, customRuleWarnings } = await scan(
			targetPath,
			options
		);
		const moduleGraphs = new Map<string, ModuleGraph>();
		moduleGraphs.set("default", moduleGraph);
		return {
			moduleGraphs,
			customRuleWarnings,
			result: {
				isMonorepo: false,
				subProjects: [{ name: "default", result }],
				combined: result,
				elapsedMs: result.elapsedMs,
			},
		};
	}

	const rootConfig = await loadConfig(targetPath, options.config);
	const { rules: customRules, warnings: customRuleWarnings } =
		await resolveCustomRules(rootConfig, targetPath);
	const combinedRules = mergeRules(allRules, customRules, customRuleWarnings);

	const filesByProject = await collectMonorepoFiles(
		targetPath,
		monorepo,
		rootConfig
	);

	const subProjects: SubProjectResult[] = [];
	const allDiagnostics: Diagnostic[] = [];
	const allRuleErrors: RuleErrorInfo[] = [];
	const moduleGraphs = new Map<string, ModuleGraph>();
	let totalFiles = 0;

	for (const [name, files] of filesByProject) {
		if (files.length === 0) {
			continue;
		}

		const projectPath = join(targetPath, monorepo.projects.get(name)!);
		const project = await detectProject(projectPath);

		// Load per-project config if available, falling back to root config
		const projectConfig = await loadConfigWithFallback(projectPath, rootConfig);

		const astProject = createAstParser(files);
		const moduleGraph = buildModuleGraph(astProject, files);
		const providers = resolveProviders(astProject, files);
		const rules = filterRules(projectConfig, combinedRules);
		const { diagnostics: rawDiagnostics, errors } = runRules(
			astProject,
			files,
			rules,
			{ moduleGraph, providers, config: projectConfig }
		);
		const diagnostics = filterIgnoredDiagnostics(
			rawDiagnostics,
			projectConfig,
			projectPath
		);

		const score = calculateScore(diagnostics, files.length);
		const summary = buildSummary(diagnostics);
		const ruleErrors: RuleErrorInfo[] = errors.map((e) => ({
			ruleId: e.ruleId,
			error: formatRuleError(e.error),
		}));

		const result: DiagnoseResult = {
			score,
			diagnostics,
			project: {
				...project,
				fileCount: files.length,
				moduleCount: moduleGraph.modules.size,
			},
			summary,
			ruleErrors,
			elapsedMs: 0,
		};

		subProjects.push({ name, result });
		moduleGraphs.set(name, moduleGraph);
		allDiagnostics.push(...diagnostics);
		allRuleErrors.push(...ruleErrors);
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
		ruleErrors: allRuleErrors,
		elapsedMs,
	};

	return {
		moduleGraphs,
		customRuleWarnings,
		result: {
			isMonorepo: true,
			subProjects,
			combined,
			elapsedMs,
		},
	};
}

async function loadConfigWithFallback(
	projectPath: string,
	fallback: NestjsDoctorConfig
): Promise<NestjsDoctorConfig> {
	try {
		return await loadConfig(projectPath);
	} catch {
		return fallback;
	}
}

function buildSummary(diagnostics: Diagnostic[]): DiagnoseSummary {
	const summary: DiagnoseSummary = {
		total: 0,
		errors: 0,
		warnings: 0,
		info: 0,
		byCategory: {
			security: 0,
			performance: 0,
			correctness: 0,
			architecture: 0,
		},
	};

	for (const d of diagnostics) {
		summary.total++;
		if (d.severity === "error") {
			summary.errors++;
		} else if (d.severity === "warning") {
			summary.warnings++;
		} else {
			summary.info++;
		}
		summary.byCategory[d.category]++;
	}

	return summary;
}
