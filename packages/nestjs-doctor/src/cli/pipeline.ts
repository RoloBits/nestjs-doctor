import { performance } from "node:perf_hooks";
import type { Diagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import { computeBaselineDelta } from "../engine/baseline.js";
import { collectEntryModules } from "../engine/graph/entry-points.js";
import { detachModuleGraph } from "../engine/graph/module-graph.js";
import { pruneCrossProjectOrphans } from "../engine/orphan-prune.js";
import type { MonorepoInfo } from "../engine/project-detector.js";
import { withScopedDiagnostics } from "../engine/result-builder.js";
import { allRules } from "../engine/rules/index.js";
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
import { getEcosystem, resetEcosystem } from "../telemetry/ecosystem.js";
import { generatedIn } from "../telemetry/environment.js";
import { resolveIdentity } from "../telemetry/install-id.js";
import {
	buildScanPayload,
	readConfigFacts,
} from "../telemetry/scan-telemetry.js";
import { scanTelemetryEnabled, sendScanTelemetry } from "../telemetry/send.js";
import { resolveMinScore } from "./min-score.js";
import {
	getCliVersion,
	outputMonorepoResults,
	outputSingleProjectResults,
} from "./output.js";
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
	/** Set when any scanned sub-project declares its own opt-out. */
	protected subProjectOptOut = false;
	/** Warnings raised while narrowing the scope; surfaced alongside the report. */
	protected scopeWarnings: string[] = [];
	protected readonly steps: PipelineStep[] = [];
	protected readonly targetPath: string;

	constructor(targetPath: string, options: PipelineOptions) {
		this.targetPath = targetPath;
		this.options = options;
	}

	/**
	 * Reports the scan anonymously. A failure here leaves the scan untouched,
	 * and the network call runs in a detached child.
	 */
	protected reportScan(
		diagnostics: Diagnostic[],
		result: DiagnoseResult,
		fileCount: number,
		monorepo: boolean
	): void {
		if (
			this.subProjectOptOut ||
			!scanTelemetryEnabled(this.options.telemetry, this.scanConfig?.config)
		) {
			return;
		}
		try {
			const identity = resolveIdentity(this.targetPath);
			const enabled = new Set(
				[
					...this.scanConfig.fileRules,
					...this.scanConfig.projectRules,
					...this.scanConfig.schemaRules,
				].map((rule) => rule.meta.id)
			);
			sendScanTelemetry(
				buildScanPayload({
					config: readConfigFacts(this.scanConfig.config),
					customRulesLoaded: this.scanConfig.combinedRules.filter((rule) =>
						rule.meta.id.startsWith("custom/")
					).length,
					diagnostics,
					disabledRuleIds: allRules
						.map((rule) => rule.meta.id)
						.filter((id) => !enabled.has(id)),
					ecosystem: getEcosystem(),
					elapsedMs: result.elapsedMs,
					fileCount,
					framework: result.project.framework,
					monorepo,
					nestVersion: result.project.nestVersion,
					orm: result.project.orm,
					projectId: identity.projectId,
					ruleErrors: result.ruleErrors,
					score: result.score,
					source: generatedIn(),
					version: getCliVersion(),
				}),
				identity.anonymousId
			);
		} catch {
			// Reporting never breaks a scan.
		}
	}

	abstract applyScope(): this;
	abstract buildContext(): this;
	abstract buildResult(): this;
	abstract output(): this;
	abstract runRules(): this;

	resolveConfig(): this {
		this.steps.push(async () => {
			resetEcosystem();
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
	private readonly bootstrapRoots: string[] = [];
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
			this.scanResults = await reduceSubProjects(
				this.targetPath,
				this.scanConfig,
				this.monorepo,
				(name, context: AnalysisContext) => {
					if (context.config?.telemetry === false) {
						this.subProjectOptOut = true;
					}
					for (const root of collectEntryModules(
						context.astProject,
						context.files,
						context.moduleGraph
					)) {
						this.bootstrapRoots.push(`${name}/${root}`);
					}
					const scanResult = buildResult(context, diagnose(context));
					return {
						...scanResult,
						moduleGraph: detachModuleGraph(scanResult.moduleGraph),
						providers: new Map(),
					};
				}
			);
		});
		return this;
	}

	buildResult(): this {
		this.steps.push(() => {
			pruneCrossProjectOrphans(this.scanResults, this.bootstrapRoots);
			const totalElapsedMs = performance.now() - this.scanStartTime;
			this.result = buildMonorepoResult(
				this.scanResults,
				this.scanConfig.customRuleWarnings,
				totalElapsedMs
			);
			// Before applyScope, which narrows `diagnostics` in place.
			const combined = this.result.result.combined;
			this.reportScan(
				combined.diagnostics,
				combined,
				combined.project.fileCount,
				true
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
			// Before applyScope, which narrows `diagnostics` in place.
			this.reportScan(
				this.rawOutput.diagnostics,
				this.result.result,
				this.context.files.length,
				false
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
