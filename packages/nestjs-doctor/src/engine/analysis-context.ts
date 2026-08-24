import { join } from "node:path";
import type { Project } from "ts-morph";
import type { NestjsDoctorConfig } from "../common/config.js";
import type { EndpointGraph } from "../common/endpoint.js";
import type { ProjectInfo } from "../common/result.js";
import type { SchemaGraph } from "../common/schema.js";
import { loadConfigWithFallback } from "./config/loader.js";
import { resolveScanConfig, type ScanConfig } from "./config/scan-config.js";
import { collectFiles, collectMonorepoFiles } from "./file-collector.js";
import { createAstParser } from "./graph/ast-parser.js";
import {
	buildEndpointGraphWithProgress,
	updateEndpointGraphForFile,
} from "./graph/endpoint-graph.js";
import {
	buildGuardDecoratorIndexAsync,
	type GuardDecoratorIndex,
	updateGuardDecoratorIndexForFile,
} from "./graph/guard-decorators.js";
import {
	buildModuleGraphAsync,
	type ModuleGraph,
	updateModuleGraphForFile,
} from "./graph/module-graph.js";
import {
	loadTsconfigResolution,
	type PathAliasMap,
} from "./graph/tsconfig-paths.js";
import type { ProviderInfo } from "./graph/type-resolver.js";
import {
	resolveProvidersAsync,
	updateProvidersForFile,
} from "./graph/type-resolver.js";
import { detectProject, type MonorepoInfo } from "./project-detector.js";
import { filterRules, separateRules } from "./rules/rule-pipeline.js";
import type { ProjectRule, Rule, SchemaRule } from "./rules/types.js";
import {
	extractSchema,
	ormReadsFromTargetPath,
	updateSchemaForFile,
} from "./schema/extract.js";
import { yieldToEventLoop } from "./yield.js";

export interface AnalysisContext {
	astProject: Project;
	config: NestjsDoctorConfig;
	endpointGraph: EndpointGraph;
	fileRules: Rule[];
	files: string[];
	guardDecorators: GuardDecoratorIndex;
	installRoot?: string;
	moduleGraph: ModuleGraph;
	pathAliases: PathAliasMap;
	project: ProjectInfo;
	projectRules: ProjectRule[];
	providers: Map<string, ProviderInfo>;
	schemaGraph?: SchemaGraph;
	schemaRules: SchemaRule[];
	targetPath: string;
}

export type AnalysisPhase = "collecting" | "parsing" | "analyzing";

/** Reports where the context build is. Counts come with "parsing" and "analyzing". */
export type AnalysisProgress = (
	phase: AnalysisPhase,
	parsed?: number,
	total?: number
) => void;

export async function buildAnalysisContext(
	targetPath: string,
	scanConfig: ScanConfig,
	onProgress?: AnalysisProgress
): Promise<AnalysisContext> {
	const { config, fileRules, projectRules, schemaRules } = scanConfig;
	onProgress?.("collecting");
	const [files, project] = await Promise.all([
		collectFiles(targetPath, config),
		detectProject(targetPath),
	]);
	const { aliases: pathAliases, baseUrl } = loadTsconfigResolution(targetPath);
	const astProject = await createAstParser(
		files,
		pathAliases,
		baseUrl,
		(parsed, total) => onProgress?.("parsing", parsed, total)
	);
	onProgress?.("analyzing");
	await yieldToEventLoop();
	const moduleGraph = await buildModuleGraphAsync(
		astProject,
		files,
		pathAliases
	);
	await yieldToEventLoop();
	const providers = await resolveProvidersAsync(astProject, files);
	await yieldToEventLoop();
	const endpointGraph = await buildEndpointGraphWithProgress(
		astProject,
		files,
		providers,
		(traced, total) => onProgress?.("analyzing", traced, total)
	);
	await yieldToEventLoop();
	const schemaGraph = extractSchema(astProject, files, project.orm, targetPath);
	await yieldToEventLoop();

	return {
		astProject,
		config,
		endpointGraph,
		fileRules,
		files,
		guardDecorators: await buildGuardDecoratorIndexAsync(astProject, files),
		moduleGraph,
		pathAliases,
		project,
		projectRules,
		providers,
		schemaGraph,
		schemaRules,
		targetPath,
		...(scanConfig.installRoot ? { installRoot: scanConfig.installRoot } : {}),
	};
}

export async function prepareAnalysis(
	targetPath: string,
	options: { config?: string } = {}
): Promise<{ context: AnalysisContext; customRuleWarnings: string[] }> {
	const scanConfig = await resolveScanConfig(targetPath, options.config);
	const context = await buildAnalysisContext(targetPath, scanConfig);
	return { context, customRuleWarnings: scanConfig.customRuleWarnings };
}

export function updateFile(context: AnalysisContext, filePath: string): void {
	const existing = context.astProject.getSourceFile(filePath);
	if (existing) {
		context.astProject.removeSourceFile(existing);
	}

	context.astProject.addSourceFileAtPath(filePath);

	if (!context.files.includes(filePath)) {
		context.files.push(filePath);
	}

	updateModuleGraphForFile(
		context.moduleGraph,
		context.astProject,
		filePath,
		context.pathAliases
	);
	updateGuardDecoratorIndexForFile(
		context.guardDecorators,
		context.astProject,
		filePath
	);
	updateProvidersForFile(context.providers, context.astProject, filePath);
	updateEndpointGraphForFile(
		context.endpointGraph,
		context.astProject,
		filePath,
		context.providers
	);
	if (context.schemaGraph) {
		updateSchemaForFile(
			context.schemaGraph,
			context.astProject,
			filePath,
			context.targetPath
		);
	}
}

/** Resolves the workspace-root schema for an ORM. */
type RootSchemaLookup = (
	orm: string,
	astProject: Project,
	files: string[]
) => SchemaGraph;

/** Builds the context for a single sub-project. */
async function buildSubProjectContext(
	targetPath: string,
	scanConfig: ScanConfig,
	monorepo: MonorepoInfo,
	name: string,
	files: string[],
	rootSchemaFor: RootSchemaLookup,
	onProgress?: AnalysisProgress
): Promise<AnalysisContext> {
	const { config: rootConfig, combinedRules } = scanConfig;
	const projectPath = join(targetPath, monorepo.projects.get(name)!);
	const [project, projectConfig] = await Promise.all([
		detectProject(projectPath),
		loadConfigWithFallback(projectPath, rootConfig),
	]);

	const { aliases: pathAliases, baseUrl } = loadTsconfigResolution(projectPath);
	const astProject = await createAstParser(
		files,
		pathAliases,
		baseUrl,
		(parsed, total) => onProgress?.("parsing", parsed, total)
	);
	onProgress?.("analyzing");
	await yieldToEventLoop();
	const moduleGraph = await buildModuleGraphAsync(
		astProject,
		files,
		pathAliases
	);
	await yieldToEventLoop();
	const providers = await resolveProvidersAsync(astProject, files);
	await yieldToEventLoop();
	const endpointGraph = await buildEndpointGraphWithProgress(
		astProject,
		files,
		providers,
		(traced, total) => onProgress?.("analyzing", traced, total)
	);
	await yieldToEventLoop();
	let schemaGraph = extractSchema(astProject, files, project.orm, projectPath);
	// Falls back to the workspace root, where a monorepo usually keeps its schema.
	if (
		project.orm &&
		ormReadsFromTargetPath(project.orm) &&
		schemaGraph.entities.size === 0
	) {
		schemaGraph = rootSchemaFor(project.orm, astProject, files);
	}
	const rules = filterRules(projectConfig, combinedRules);
	const { fileRules, projectRules, schemaRules } = separateRules(rules);

	return {
		astProject,
		config: projectConfig,
		endpointGraph,
		fileRules,
		files,
		guardDecorators: await buildGuardDecoratorIndexAsync(astProject, files),
		moduleGraph,
		pathAliases,
		project,
		projectRules,
		providers,
		schemaGraph,
		schemaRules,
		targetPath: projectPath,
		...(scanConfig.installRoot ? { installRoot: scanConfig.installRoot } : {}),
	};
}

/**
 * Builds each sub-project in turn, hands it to `consume`, and drops it before
 * the next. Only what `consume` returns is retained.
 */
export async function reduceSubProjects<T>(
	targetPath: string,
	scanConfig: ScanConfig,
	monorepo: MonorepoInfo,
	consume: (name: string, context: AnalysisContext) => T | Promise<T>,
	onProject?: (name: string, index: number, total: number) => void,
	onAnalysis?: (
		name: string,
		phase: AnalysisPhase,
		parsed?: number,
		total?: number
	) => void
): Promise<Map<string, T>> {
	const filesByProject = await collectMonorepoFiles(
		targetPath,
		monorepo,
		scanConfig.config
	);

	// One workspace root, so one answer; every sub-project that needs it reuses
	// the same extraction instead of repeating the file lookup.
	const rootSchemas = new Map<string, SchemaGraph>();
	const rootSchemaFor: RootSchemaLookup = (orm, astProject, files) => {
		const cached = rootSchemas.get(orm);
		if (cached) {
			return cached;
		}
		const graph = extractSchema(astProject, files, orm, targetPath);
		rootSchemas.set(orm, graph);
		return graph;
	};

	const results = new Map<string, T>();
	const total = [...filesByProject.values()].filter(
		(files) => files.length > 0
	).length;
	let index = 0;
	for (const [name, files] of filesByProject) {
		if (files.length === 0) {
			continue;
		}
		index++;
		onProject?.(name, index, total);
		const context = await buildSubProjectContext(
			targetPath,
			scanConfig,
			monorepo,
			name,
			files,
			rootSchemaFor,
			(phase, parsed, total) => onAnalysis?.(name, phase, parsed, total)
		);
		results.set(name, await consume(name, context));
	}
	return results;
}
