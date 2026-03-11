import { join } from "node:path";
import type { Project } from "ts-morph";
import type { NestjsDoctorConfig } from "../common/config.js";
import type { ProjectInfo } from "../common/result.js";
import type { SchemaGraph } from "../common/schema.js";
import { loadConfigWithFallback } from "./config/loader.js";
import { resolveScanConfig, type ScanConfig } from "./config/scan-config.js";
import { collectFiles, collectMonorepoFiles } from "./file-collector.js";
import { createAstParser } from "./graph/ast-parser.js";
import {
	buildModuleGraph,
	type ModuleGraph,
	updateModuleGraphForFile,
} from "./graph/module-graph.js";
import { loadPathAliases, type PathAliasMap } from "./graph/tsconfig-paths.js";
import type { ProviderInfo } from "./graph/type-resolver.js";
import {
	resolveProviders,
	updateProvidersForFile,
} from "./graph/type-resolver.js";
import { detectProject, type MonorepoInfo } from "./project-detector.js";
import { filterRules, separateRules } from "./rules/rule-pipeline.js";
import type { ProjectRule, Rule, SchemaRule } from "./rules/types.js";
import { extractSchema, updateSchemaForFile } from "./schema/extract.js";

export interface AnalysisContext {
	astProject: Project;
	config: NestjsDoctorConfig;
	fileRules: Rule[];
	files: string[];
	moduleGraph: ModuleGraph;
	pathAliases: PathAliasMap;
	project: ProjectInfo;
	projectRules: ProjectRule[];
	providers: Map<string, ProviderInfo>;
	schemaGraph?: SchemaGraph;
	schemaRules: SchemaRule[];
	targetPath: string;
}

export interface MonorepoContext {
	subProjects: Map<string, AnalysisContext>;
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
	const astProject = createAstParser(files);
	const pathAliases = loadPathAliases(targetPath);
	const moduleGraph = buildModuleGraph(astProject, files, pathAliases);
	const providers = resolveProviders(astProject, files);
	const schemaGraph = extractSchema(astProject, files, project.orm, targetPath);

	return {
		astProject,
		config,
		fileRules,
		files,
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

export async function buildMonorepoContext(
	targetPath: string,
	scanConfig: ScanConfig,
	monorepo: MonorepoInfo
): Promise<MonorepoContext> {
	const { config: rootConfig, combinedRules } = scanConfig;
	const filesByProject = await collectMonorepoFiles(
		targetPath,
		monorepo,
		rootConfig
	);

	const entries = await Promise.all(
		[...filesByProject.entries()]
			.filter(([, files]) => files.length > 0)
			.map(async ([name, files]): Promise<[string, AnalysisContext]> => {
				const projectPath = join(targetPath, monorepo.projects.get(name)!);
				const [project, projectConfig] = await Promise.all([
					detectProject(projectPath),
					loadConfigWithFallback(projectPath, rootConfig),
				]);

				const astProject = createAstParser(files);
				const pathAliases = loadPathAliases(projectPath);
				const moduleGraph = buildModuleGraph(astProject, files, pathAliases);
				const providers = resolveProviders(astProject, files);
				const schemaGraph = extractSchema(
					astProject,
					files,
					project.orm,
					projectPath
				);
				const rules = filterRules(projectConfig, combinedRules);
				const { fileRules, projectRules, schemaRules } = separateRules(rules);

				return [
					name,
					{
						astProject,
						config: projectConfig,
						fileRules,
						files,
						moduleGraph,
						pathAliases,
						project,
						projectRules,
						providers,
						schemaGraph,
						schemaRules,
						targetPath: projectPath,
					},
				];
			})
	);

	return { subProjects: new Map(entries) };
}
