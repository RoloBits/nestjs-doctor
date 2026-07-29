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
	buildEndpointGraph,
	updateEndpointGraphForFile,
} from "./graph/endpoint-graph.js";
import {
	buildGuardDecoratorIndex,
	type GuardDecoratorIndex,
	updateGuardDecoratorIndexForFile,
} from "./graph/guard-decorators.js";
import {
	buildModuleGraph,
	type ModuleGraph,
	updateModuleGraphForFile,
} from "./graph/module-graph.js";
import {
	loadTsconfigResolution,
	type PathAliasMap,
} from "./graph/tsconfig-paths.js";
import type { ProviderInfo } from "./graph/type-resolver.js";
import {
	resolveProviders,
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

export interface AnalysisContext {
	astProject: Project;
	config: NestjsDoctorConfig;
	endpointGraph: EndpointGraph;
	fileRules: Rule[];
	files: string[];
	guardDecorators: GuardDecoratorIndex;
	moduleGraph: ModuleGraph;
	pathAliases: PathAliasMap;
	project: ProjectInfo;
	projectRules: ProjectRule[];
	providers: Map<string, ProviderInfo>;
	schemaGraph?: SchemaGraph;
	schemaRules: SchemaRule[];
	targetPath: string;
}

export async function buildAnalysisContext(
	targetPath: string,
	scanConfig: ScanConfig
): Promise<AnalysisContext> {
	const { config, fileRules, projectRules, schemaRules } = scanConfig;
	const [files, project] = await Promise.all([
		collectFiles(targetPath, config),
		detectProject(targetPath),
	]);
	const { aliases: pathAliases, baseUrl } = loadTsconfigResolution(targetPath);
	const astProject = createAstParser(files, pathAliases, baseUrl);
	const moduleGraph = buildModuleGraph(astProject, files, pathAliases);
	const providers = resolveProviders(astProject, files);
	const endpointGraph = buildEndpointGraph(astProject, files, providers);
	const schemaGraph = extractSchema(astProject, files, project.orm, targetPath);

	return {
		astProject,
		config,
		endpointGraph,
		fileRules,
		files,
		guardDecorators: buildGuardDecoratorIndex(astProject, files),
		moduleGraph,
		pathAliases,
		project,
		projectRules,
		providers,
		schemaGraph,
		schemaRules,
		targetPath,
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
	rootSchemaFor: RootSchemaLookup
): Promise<AnalysisContext> {
	const { config: rootConfig, combinedRules } = scanConfig;
	const projectPath = join(targetPath, monorepo.projects.get(name)!);
	const [project, projectConfig] = await Promise.all([
		detectProject(projectPath),
		loadConfigWithFallback(projectPath, rootConfig),
	]);

	const { aliases: pathAliases, baseUrl } = loadTsconfigResolution(projectPath);
	const astProject = createAstParser(files, pathAliases, baseUrl);
	const moduleGraph = buildModuleGraph(astProject, files, pathAliases);
	const providers = resolveProviders(astProject, files);
	const endpointGraph = buildEndpointGraph(astProject, files, providers);
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
		guardDecorators: buildGuardDecoratorIndex(astProject, files),
		moduleGraph,
		pathAliases,
		project,
		projectRules,
		providers,
		schemaGraph,
		schemaRules,
		targetPath: projectPath,
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
	consume: (name: string, context: AnalysisContext) => T
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
	for (const [name, files] of filesByProject) {
		if (files.length === 0) {
			continue;
		}
		const context = await buildSubProjectContext(
			targetPath,
			scanConfig,
			monorepo,
			name,
			files,
			rootSchemaFor
		);
		results.set(name, consume(name, context));
	}
	return results;
}
