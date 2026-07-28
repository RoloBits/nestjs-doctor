import { performance } from "node:perf_hooks";
import type { Diagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import { computeBaselineDelta } from "../engine/baseline.js";
import { detachModuleGraph } from "../engine/graph/module-graph.js";
import type { MonorepoInfo } from "../engine/project-detector.js";
import { withScopedDiagnostics } from "../engine/result-builder.js";
import {
	type AnalysisContext,
	buildAnalysisContext,
	buildMonorepoResult,
	buildResult,
	diagnose,
	type EngineResult,
	type MonorepoEngineResult,
	type RawDiagnosticOutput,
	reduceSubProjects,
	resolveScanConfig,
	type ScanConfig,
} from "../engine/scanner.js";
import {
	applyScope,
	buildScopeInfo,
	type ResolvedScope,
	resolveScope,
} from "../engine/scope.js";
import { resolveMinScore } from "./min-score.js";
import { outputMonorepoResults, outputSingleProjectResults } from "./output.js";
import type { PipelineOptions } from "./setup.js";
import { logger } from "./ui/logger.js";
import { spinner } from "./ui/spinner.js";

type PipelineStep = () => void | Promise<void>;

const displayCustomRuleWarnings = (
	warnings: string[],
	isMachineReadable: boolean
): void => {
	if (isMachineReadable) {
		return;
	}
	for (const warning of warnings) {
		logger.warn(warning);
	}
};

/** Abstract base for scan pipelines — shared step queue, config, scoping, warnings */
abstract class ScanPipeline {
	protected readonly options: PipelineOptions;
	protected resolvedMinimumScore: number | undefined;
	protected scanConfig!: ScanConfig;
	/** Warnings raised while narrowing the scope; surfaced alongside the report. */
	protected scopeWarnings: string[] = [];
	protected readonly steps: PipelineStep[] = [];
	protected readonly targetPath: string;

	constructor(targetPath: string, options: PipelineOptions) {
		this.targetPath = targetPath;
		this.options = options;
	}

	abstract applyScope(): this;
	abstract buildContext(): this;
	abstract buildResult(): this;
	abstract output(): this;
	abstract runRules(): this;

	resolveConfig(): this {
		this.steps.push(async () => {
			this.scanConfig = await resolveScanConfig(
				this.targetPath,
				this.options.configPath
			);
			this.resolvedMinimumScore = resolveMinScore(
				this.options.minScore,
				this.scanConfig.config.minScore
			);
		});
		return this;
	}

	warnCustomRules(): this {
		this.steps.push(() => {
			displayCustomRuleWarnings(
				this.scanConfig.customRuleWarnings,
				this.options.isMachineReadable
			);
		});
		return this;
	}

	/** Narrows a result to the requested scope, filtering only what is reported. */
	protected async scopeResult(
		result: DiagnoseResult,
		monorepo?: MonorepoInfo
	): Promise<DiagnoseResult> {
		if (this.options.scope === "full" && !this.options.staged) {
			return result;
		}

		const scope: ResolvedScope = resolveScope({
			base: this.options.base,
			changedFilesFrom: this.options.changedFilesFrom,
			mode: this.options.scope,
			staged: this.options.staged,
			targetPath: this.targetPath,
		});
		this.scopeWarnings.push(...scope.warnings);

		if (scope.mode !== "changed") {
			return withScopedDiagnostics(
				result,
				applyScope(result.diagnostics, scope),
				buildScopeInfo(scope)
			);
		}

		const delta = await computeBaselineDelta(
			result.diagnostics,
			scope,
			this.targetPath,
			this.scanConfig,
			monorepo
		);
		this.scopeWarnings.push(...delta.warnings);

		if (!delta.available) {
			// Without a base to subtract, "introduced" is unknowable — report every
			// finding in the changed files rather than implying a measured delta.
			const degraded: ResolvedScope = { ...scope, mode: "files" };
			return withScopedDiagnostics(
				result,
				applyScope(result.diagnostics, degraded),
				buildScopeInfo(degraded, { baselineAvailable: false })
			);
		}

		return withScopedDiagnostics(
			result,
			delta.introduced,
			buildScopeInfo(scope, { baselineAvailable: true, fixed: delta.fixed })
		);
	}

	async run(): Promise<void> {
		const progress = this.options.isMachineReadable
			? null
			: spinner("Scanning...").start();

		for (const step of this.steps) {
			await step();
		}

		progress?.succeed("Scan complete");
	}
}

/**
 * Keeps a sub-project's diagnostics in step with a scoped combined result,
 * matching by object identity.
 */
const restrictToKept = (
	result: DiagnoseResult,
	kept: Set<Diagnostic>
): DiagnoseResult =>
	withScopedDiagnostics(
		result,
		result.diagnostics.filter((diagnostic) => kept.has(diagnostic)),
		result.scope
	);

/** Monorepo scan builder — resolveConfig, buildContext, runRules, buildResult, applyScope, warn, output */
export class MonorepoPipeline extends ScanPipeline {
	private readonly monorepo: MonorepoInfo;
	private scanResults!: Map<string, EngineResult>;
	private result!: MonorepoEngineResult;
	private scanStartTime!: number;

	constructor(
		targetPath: string,
		monorepo: MonorepoInfo,
		options: PipelineOptions
	) {
		super(targetPath, options);
		this.monorepo = monorepo;
	}

	buildContext(): this {
		this.steps.push(() => {
			this.scanStartTime = performance.now();
		});
		return this;
	}

	runRules(): this {
		this.steps.push(async () => {
			// Build, diagnose and reduce each sub-project in turn. Holding all of
			// their ts-morph projects at once is what runs a large workspace out of
			// memory, because every type a rule asks the checker for stays on them.
			this.scanResults = await reduceSubProjects(
				this.targetPath,
				this.scanConfig,
				this.monorepo,
				(_name, context: AnalysisContext) => {
					const scanResult = buildResult(context, diagnose(context));
					return {
						...scanResult,
						moduleGraph: detachModuleGraph(scanResult.moduleGraph),
						// ProviderInfo holds a ts-morph node, which anchors the project
						providers: new Map(),
					};
				}
			);
		});
		return this;
	}

	buildResult(): this {
		this.steps.push(() => {
			const totalElapsedMs = performance.now() - this.scanStartTime;
			this.result = buildMonorepoResult(
				this.scanResults,
				this.scanConfig.customRuleWarnings,
				totalElapsedMs
			);
		});
		return this;
	}

	applyScope(): this {
		this.steps.push(async () => {
			const combined = await this.scopeResult(
				this.result.result.combined,
				this.monorepo
			);
			if (combined === this.result.result.combined) {
				return;
			}

			const kept = new Set(combined.diagnostics);
			this.result = {
				...this.result,
				result: {
					...this.result.result,
					combined,
					subProjects: this.result.result.subProjects.map(
						({ name, result }) => ({
							name,
							result: restrictToKept(result, kept),
						})
					),
				},
			};
		});
		return this;
	}

	output(): this {
		this.steps.push(() => {
			outputMonorepoResults(
				this.result,
				this.resolvedMinimumScore,
				this.targetPath,
				this.options,
				this.scopeWarnings
			);
		});
		return this;
	}
}

/** Single-project scan builder — resolveConfig, buildContext, runRules, buildResult, applyScope, warn, output */
export class SingleProjectPipeline extends ScanPipeline {
	private context!: AnalysisContext;
	private rawOutput!: RawDiagnosticOutput;
	private result!: EngineResult;

	buildContext(): this {
		this.steps.push(async () => {
			this.context = await buildAnalysisContext(
				this.targetPath,
				this.scanConfig
			);
		});
		return this;
	}

	runRules(): this {
		this.steps.push(() => {
			this.rawOutput = diagnose(this.context);
		});
		return this;
	}

	buildResult(): this {
		this.steps.push(() => {
			this.result = buildResult(
				this.context,
				this.rawOutput,
				this.scanConfig.customRuleWarnings
			);
		});
		return this;
	}

	applyScope(): this {
		this.steps.push(async () => {
			this.result = {
				...this.result,
				result: await this.scopeResult(this.result.result),
			};
		});
		return this;
	}

	output(): this {
		this.steps.push(() => {
			outputSingleProjectResults(
				this.result,
				this.resolvedMinimumScore,
				this.targetPath,
				this.options,
				this.scopeWarnings
			);
		});
		return this;
	}
}
