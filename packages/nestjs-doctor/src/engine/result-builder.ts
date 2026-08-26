import {
	type Diagnostic,
	type DiagnosticSurface,
	forSurface,
	isSchemaDiagnostic,
} from "../common/diagnostic.js";
import type { EndpointNode } from "../common/endpoint.js";
import type {
	DiagnoseResult,
	DiagnoseSummary,
	MonorepoResult,
	RuleErrorInfo,
	SubProjectResult,
} from "../common/result.js";
import type {
	SchemaGraph,
	SchemaRelation,
	SerializedSchemaEntity,
} from "../common/schema.js";
import type { ScopeInfo } from "../common/scope.js";
import type { AnalysisContext } from "./analysis-context.js";
import type { RawDiagnosticOutput } from "./diagnostician.js";
import type { ModuleGraph } from "./graph/module-graph.js";
import type { ProviderInfo } from "./graph/type-resolver.js";
import { extractSchema, serializeSchemaGraph } from "./schema/extract.js";
import { calculateScore } from "./scorer/index.js";

export interface EngineResult {
	customRuleWarnings: string[];
	files: string[];
	moduleGraph: ModuleGraph;
	providers: Map<string, ProviderInfo>;
	result: DiagnoseResult;
	schemaGraph: SchemaGraph;
}

export interface MonorepoEngineResult {
	customRuleWarnings: string[];
	moduleGraphs: Map<string, ModuleGraph>;
	result: MonorepoResult;
}

/**
 * Replaces a result's diagnostics and recomputes the summary. The score is
 * carried over: it measures the project, not the reported subset.
 */
export function withScopedDiagnostics(
	result: DiagnoseResult,
	diagnostics: Diagnostic[],
	scope: ScopeInfo | undefined
): DiagnoseResult {
	return {
		...result,
		diagnostics,
		summary: buildSummary(diagnostics),
		...(scope ? { scope } : {}),
	};
}

/**
 * The result as one surface sees it: diagnostics and counts narrowed, score
 * left alone because it always reflects the whole project.
 */
export function withSurface(
	result: DiagnoseResult,
	surface: DiagnosticSurface
): DiagnoseResult {
	const diagnostics = forSurface(result.diagnostics, surface);
	if (diagnostics.length === result.diagnostics.length) {
		return result;
	}
	return { ...result, diagnostics, summary: buildSummary(diagnostics) };
}

export function buildSummary(diagnostics: Diagnostic[]): DiagnoseSummary {
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

export function buildResult(
	context: AnalysisContext,
	rawOutput: RawDiagnosticOutput,
	customRuleWarnings: string[] = []
): EngineResult {
	const { diagnostics, ruleErrors, elapsedMs } = rawOutput;
	const schemaGraph =
		context.schemaGraph ??
		extractSchema(
			context.astProject,
			context.files,
			context.project.orm,
			context.targetPath
		);
	const score = calculateScore(diagnostics, context.files.length);
	const summary = buildSummary(diagnostics);
	const result: DiagnoseResult = {
		score,
		diagnostics,
		endpoints: context.endpointGraph,
		project: {
			...context.project,
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

export function buildMonorepoResult(
	scanResults: Map<string, ReturnType<typeof buildResult>>,
	customRuleWarnings: string[],
	totalElapsedMs: number
): MonorepoEngineResult {
	const subProjects: SubProjectResult[] = [];
	const allDiagnostics: Diagnostic[] = [];
	const allRuleErrors: RuleErrorInfo[] = [];
	const moduleGraphs = new Map<string, ModuleGraph>();
	const allEndpoints: EndpointNode[] = [];
	let totalFiles = 0;
	const allSchemaEntities: SerializedSchemaEntity[] = [];
	const allSchemaRelations: SchemaRelation[] = [];
	let detectedOrm = "";

	// Drops the repeats when sub-projects share one workspace-root schema and
	// each extracts it.
	const seenSchemaEntities = new Set<string>();
	const seenSchemaDiagnostics = new Set<string>();
	const seenProjectDiagnostics = new Set<string>();

	for (const [name, scanResult] of scanResults) {
		moduleGraphs.set(name, scanResult.moduleGraph);
		const kept: Diagnostic[] = [];
		const localSchemaKeys = new Set<string>();
		const localProjectKeys = new Set<string>();
		for (const diagnostic of scanResult.result.diagnostics) {
			const key = isSchemaDiagnostic(diagnostic)
				? `${diagnostic.rule}\0${diagnostic.filePath}\0${diagnostic.entity}\0${diagnostic.message}`
				: `${diagnostic.rule}\0${diagnostic.filePath}\0${diagnostic.line}\0${diagnostic.column}\0${diagnostic.message}`;
			const schema = isSchemaDiagnostic(diagnostic);
			const seen = schema ? seenSchemaDiagnostics : seenProjectDiagnostics;
			const local = schema ? localSchemaKeys : localProjectKeys;
			// Drops only what an earlier sub-project already reported.
			if (seen.has(key) && !local.has(key)) {
				continue;
			}
			local.add(key);
			kept.push(diagnostic);
			allDiagnostics.push(diagnostic);
		}
		for (const key of localSchemaKeys) {
			seenSchemaDiagnostics.add(key);
		}
		for (const key of localProjectKeys) {
			seenProjectDiagnostics.add(key);
		}
		// Carries the diagnostics the combined result took. Score untouched.
		subProjects.push({
			name,
			result: {
				...scanResult.result,
				diagnostics: kept,
				summary: buildSummary(kept),
			},
		});
		allRuleErrors.push(...scanResult.result.ruleErrors);
		totalFiles += scanResult.result.project.fileCount;
		if (scanResult.result.endpoints) {
			allEndpoints.push(...scanResult.result.endpoints.endpoints);
		}
		if (scanResult.result.schema) {
			for (const entity of scanResult.result.schema.entities) {
				const key = `${entity.filePath}\0${entity.name}`;
				if (seenSchemaEntities.has(key)) {
					continue;
				}
				seenSchemaEntities.add(key);
				allSchemaEntities.push(entity);
				allSchemaRelations.push(...entity.relations);
			}
			if (
				scanResult.result.schema.orm &&
				scanResult.result.schema.orm !== "unknown"
			) {
				detectedOrm = scanResult.result.schema.orm;
			}
		}
	}

	const combinedScore = calculateScore(allDiagnostics, totalFiles);
	const combinedSummary = buildSummary(allDiagnostics);

	const combined: DiagnoseResult = {
		score: combinedScore,
		diagnostics: allDiagnostics,
		endpoints:
			allEndpoints.length > 0 ? { endpoints: allEndpoints } : undefined,
		project: {
			name: "monorepo",
			nestVersion: subProjects[0]?.result.project.nestVersion ?? null,
			orm: detectedOrm || (subProjects[0]?.result.project.orm ?? null),
			framework: subProjects[0]?.result.project.framework ?? null,
			fileCount: totalFiles,
			moduleCount: subProjects.reduce(
				(sum, sp) => sum + sp.result.project.moduleCount,
				0
			),
		},
		summary: combinedSummary,
		ruleErrors: allRuleErrors,
		elapsedMs: totalElapsedMs,
		schema:
			allSchemaEntities.length > 0
				? {
						entities: allSchemaEntities,
						relations: allSchemaRelations,
						orm: detectedOrm || "unknown",
					}
				: undefined,
	};

	return {
		moduleGraphs,
		customRuleWarnings,
		result: {
			isMonorepo: true,
			subProjects,
			combined,
			elapsedMs: totalElapsedMs,
		},
	};
}
