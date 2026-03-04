import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { Project } from "ts-morph";
import { createAstParser } from "../engine/ast-parser.js";
import {
	buildModuleGraph,
	type ModuleGraph,
	updateModuleGraphForFile,
} from "../engine/module-graph.js";
import {
	type RunRulesOptions,
	runFileRules,
	runProjectRules,
	runRules,
	runSchemaRules,
	separateRules,
} from "../engine/rule-runner.js";
import {
	extractSchema,
	serializeSchemaGraph,
	updateSchemaForFile,
} from "../engine/schema/extract.js";
import type { ProviderInfo } from "../engine/type-resolver.js";
import {
	resolveProviders,
	updateProvidersForFile,
} from "../engine/type-resolver.js";
import { allRules } from "../rules/index.js";
import type { AnyRule, ProjectRule, Rule, SchemaRule } from "../rules/types.js";
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
import type { SchemaGraph } from "../types/schema.js";
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
	schemaGraph: SchemaGraph;
}

export interface MonorepoScanResult {
	customRuleWarnings: string[];
	moduleGraphs: Map<string, ModuleGraph>;
	result: MonorepoResult;
}

export interface ScanContext {
	astProject: Project;
	config: NestjsDoctorConfig;
	fileRules: Rule[];
	files: string[];
	moduleGraph: ModuleGraph;
	projectRules: ProjectRule[];
	providers: Map<string, ProviderInfo>;
	schemaGraph?: SchemaGraph;
	schemaRules: SchemaRule[];
	targetPath: string;
}

export async function prepareScan(
	targetPath: string,
	options: ScanOptions = {}
): Promise<{ context: ScanContext; customRuleWarnings: string[] }> {
	const config = await loadConfig(targetPath, options.config);
	const [{ rules: customRules, warnings: customRuleWarnings }, files, project] =
		await Promise.all([
			resolveCustomRules(config, targetPath),
			collectFiles(targetPath, config),
			detectProject(targetPath),
		]);
	const combinedRules = mergeRules(allRules, customRules, customRuleWarnings);
	const astProject = createAstParser(files);
	const moduleGraph = buildModuleGraph(astProject, files);
	const providers = resolveProviders(astProject, files);
	const rules = filterRules(config, combinedRules);
	const { fileRules, projectRules, schemaRules } = separateRules(rules);
	const schemaGraph = extractSchema(astProject, files, project.orm, targetPath);

	const context: ScanContext = {
		astProject,
		config,
		fileRules,
		files,
		moduleGraph,
		projectRules,
		providers,
		schemaGraph,
		schemaRules,
		targetPath,
	};

	return { context, customRuleWarnings };
}

export function updateFile(context: ScanContext, filePath: string): void {
	const existing = context.astProject.getSourceFile(filePath);
	if (existing) {
		context.astProject.removeSourceFile(existing);
	}

	context.astProject.addSourceFileAtPath(filePath);

	if (!context.files.includes(filePath)) {
		context.files.push(filePath);
	}

	updateModuleGraphForFile(context.moduleGraph, context.astProject, filePath);
	updateProvidersForFile(context.providers, context.astProject, filePath);
	if (context.schemaGraph) {
		updateSchemaForFile(
			context.schemaGraph,
			context.astProject,
			filePath,
			context.targetPath
		);
	}
}

export function scanFile(
	context: ScanContext,
	filePath: string
): { diagnostics: Diagnostic[]; errors: RuleErrorInfo[] } {
	const { diagnostics: rawDiagnostics, errors } = runFileRules(
		context.astProject,
		[filePath],
		context.fileRules
	);
	const diagnostics = filterIgnoredDiagnostics(
		rawDiagnostics,
		context.config,
		context.targetPath
	);
	const ruleErrors: RuleErrorInfo[] = errors.map((e) => ({
		ruleId: e.ruleId,
		error: formatRuleError(e.error),
	}));

	return { diagnostics, errors: ruleErrors };
}

export function scanAllFiles(context: ScanContext): {
	diagnostics: Diagnostic[];
	errors: RuleErrorInfo[];
} {
	const { diagnostics: rawDiagnostics, errors } = runFileRules(
		context.astProject,
		context.files,
		context.fileRules
	);
	const diagnostics = filterIgnoredDiagnostics(
		rawDiagnostics,
		context.config,
		context.targetPath
	);
	const ruleErrors: RuleErrorInfo[] = errors.map((e) => ({
		ruleId: e.ruleId,
		error: formatRuleError(e.error),
	}));

	return { diagnostics, errors: ruleErrors };
}

export function scanProject(context: ScanContext): {
	diagnostics: Diagnostic[];
	errors: RuleErrorInfo[];
} {
	const options: RunRulesOptions = {
		moduleGraph: context.moduleGraph,
		providers: context.providers,
		config: context.config,
	};
	const { diagnostics: rawDiagnostics, errors } = runProjectRules(
		context.astProject,
		context.files,
		context.projectRules,
		options
	);
	const diagnostics = filterIgnoredDiagnostics(
		rawDiagnostics,
		context.config,
		context.targetPath
	);
	const ruleErrors: RuleErrorInfo[] = errors.map((e) => ({
		ruleId: e.ruleId,
		error: formatRuleError(e.error),
	}));
	const schemaResult = scanSchema(context);
	diagnostics.push(...schemaResult.diagnostics);
	ruleErrors.push(...schemaResult.errors);

	return { diagnostics, errors: ruleErrors };
}

function scanSchema(context: ScanContext): {
	diagnostics: Diagnostic[];
	errors: RuleErrorInfo[];
} {
	if (!context.schemaGraph || context.schemaRules.length === 0) {
		return { diagnostics: [], errors: [] };
	}

	if (context.schemaGraph.entities.size === 0) {
		return { diagnostics: [], errors: [] };
	}

	const schemaResult = runSchemaRules(context.schemaGraph, context.schemaRules);
	const diagnostics = filterIgnoredDiagnostics(
		schemaResult.diagnostics,
		context.config,
		context.targetPath
	);
	const errors: RuleErrorInfo[] = schemaResult.errors.map((e) => ({
		ruleId: e.ruleId,
		error: formatRuleError(e.error),
	}));

	return { diagnostics, errors };
}

export async function scan(
	targetPath: string,
	options: ScanOptions = {}
): Promise<ScanResult> {
	const startTime = performance.now();

	const { context, customRuleWarnings } = await prepareScan(
		targetPath,
		options
	);

	const projectPromise = detectProject(targetPath);

	const fileResult = scanAllFiles(context);
	const projectResult = scanProject(context);

	const diagnostics = [...fileResult.diagnostics, ...projectResult.diagnostics];
	const ruleErrors = [...fileResult.errors, ...projectResult.errors];

	const project = await projectPromise;
	const schemaGraph =
		context.schemaGraph ??
		extractSchema(context.astProject, context.files, project.orm, targetPath);

	const score = calculateScore(diagnostics, context.files.length);
	const summary = buildSummary(diagnostics);
	const elapsedMs = performance.now() - startTime;

	const result: DiagnoseResult = {
		score,
		diagnostics,
		project: {
			...project,
			fileCount: context.files.length,
			moduleCount: context.moduleGraph.modules.size,
		},
		summary,
		ruleErrors,
		elapsedMs,
		schema: serializeSchemaGraph(schemaGraph),
	};

	return {
		result,
		moduleGraph: context.moduleGraph,
		schemaGraph,
		customRuleWarnings,
		files: context.files,
		providers: context.providers,
	};
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

	const subProjectEntries = await Promise.all(
		[...filesByProject.entries()]
			.filter(([, files]) => files.length > 0)
			.map(async ([name, files]) => {
				const projectPath = join(targetPath, monorepo.projects.get(name)!);
				const [project, projectConfig] = await Promise.all([
					detectProject(projectPath),
					loadConfigWithFallback(projectPath, rootConfig),
				]);

				const astProject = createAstParser(files);
				const moduleGraph = buildModuleGraph(astProject, files);
				const providers = resolveProviders(astProject, files);
				const subSchemaGraph = extractSchema(
					astProject,
					files,
					project.orm,
					projectPath
				);
				const rules = filterRules(projectConfig, combinedRules);
				const { schemaRules: subSchemaRules } = separateRules(rules);
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
				const ruleErrors: RuleErrorInfo[] = errors.map((e) => ({
					ruleId: e.ruleId,
					error: formatRuleError(e.error),
				}));

				// Run schema rules if schema was extracted
				if (subSchemaGraph.entities.size > 0 && subSchemaRules.length > 0) {
					const schemaResult = runSchemaRules(subSchemaGraph, subSchemaRules);
					const filteredSchemaDiagnostics = filterIgnoredDiagnostics(
						schemaResult.diagnostics,
						projectConfig,
						projectPath
					);
					diagnostics.push(...filteredSchemaDiagnostics);
					ruleErrors.push(
						...schemaResult.errors.map((e) => ({
							ruleId: e.ruleId,
							error: formatRuleError(e.error),
						}))
					);
				}

				const score = calculateScore(diagnostics, files.length);
				const summary = buildSummary(diagnostics);

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
					schema: serializeSchemaGraph(subSchemaGraph),
				};

				return { name, result, moduleGraph, diagnostics, ruleErrors };
			})
	);

	const subProjects: SubProjectResult[] = [];
	const allDiagnostics: Diagnostic[] = [];
	const allRuleErrors: RuleErrorInfo[] = [];
	const moduleGraphs = new Map<string, ModuleGraph>();
	let totalFiles = 0;

	for (const entry of subProjectEntries) {
		subProjects.push({ name: entry.name, result: entry.result });
		moduleGraphs.set(entry.name, entry.moduleGraph);
		allDiagnostics.push(...entry.diagnostics);
		allRuleErrors.push(...entry.ruleErrors);
		totalFiles += entry.result.project.fileCount;
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
			schema: 0,
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
