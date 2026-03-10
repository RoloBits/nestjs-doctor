import type { Diagnostic } from "../common/diagnostic.js";
import type {
	DiagnoseResult,
	DiagnoseSummary,
	MonorepoResult,
	RuleErrorInfo,
	SubProjectResult,
} from "../common/result.js";
import type { SchemaGraph } from "../common/schema.js";
import type { AnalysisContext, MonorepoContext } from "./analysis-context.js";
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
	monorepoCtx: MonorepoContext,
	rawOutputs: Map<string, RawDiagnosticOutput>,
	customRuleWarnings: string[],
	totalElapsedMs: number
): MonorepoEngineResult {
	const subProjects: SubProjectResult[] = [];
	const allDiagnostics: Diagnostic[] = [];
	const allRuleErrors: RuleErrorInfo[] = [];
	const moduleGraphs = new Map<string, ModuleGraph>();
	let totalFiles = 0;

	for (const [name, context] of monorepoCtx.subProjects) {
		const rawOutput = rawOutputs.get(name)!;
		const scanResult = buildResult(context, rawOutput);
		subProjects.push({ name, result: scanResult.result });
		moduleGraphs.set(name, scanResult.moduleGraph);
		allDiagnostics.push(...scanResult.result.diagnostics);
		allRuleErrors.push(...scanResult.result.ruleErrors);
		totalFiles += scanResult.result.project.fileCount;
	}

	const combinedScore = calculateScore(allDiagnostics, totalFiles);
	const combinedSummary = buildSummary(allDiagnostics);

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
		elapsedMs: totalElapsedMs,
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
