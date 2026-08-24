import { performance } from "node:perf_hooks";
import type { Diagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import { computeBaselineDelta } from "../engine/baseline.js";
import { collectEntryModules } from "../engine/graph/entry-points.js";
import {
	detachModuleGraph,
	mergeModuleGraphs,
} from "../engine/graph/module-graph.js";
import { pruneCrossProjectOrphans } from "../engine/orphan-prune.js";
import type { MonorepoInfo } from "../engine/project-detector.js";
import { withScopedDiagnostics } from "../engine/result-builder.js";
import { allRules } from "../engine/rules/index.js";
import {
	type AnalysisContext,
	type AnalysisPhase,
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
import {
	type ReportProvider,
	toReportProvider,
} from "../report/formatters/report-data.js";
import { buildHtmlReport } from "../report/html-report.js";
import { getEcosystem, resetEcosystem } from "../telemetry/ecosystem.js";
import { actionContext, generatedIn } from "../telemetry/environment.js";
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
import { renderProgressBar } from "./ui/progress-bar.js";
import { spinner } from "./ui/spinner.js";

type PipelineStep = () => void | Promise<void>;

const analysisText = (
	phase: AnalysisPhase,
	parsed?: number,
	total?: number
): string => {
	if (phase === "collecting") {
		return "Collecting files";
	}
	if (phase === "parsing") {
		return `Parsing files ${renderProgressBar(parsed ?? 0, total ?? 0)}`;
	}
	if (total) {
		return `Analyzing the project ${renderProgressBar(parsed ?? 0, total)}`;
	}
	return "Analyzing the project";
};

/** Handed to the post-scan menu so its actions reuse the finished scan. */
export interface InteractiveArtifacts {
	buildReportHtml: () => string;
	result: DiagnoseResult;
}

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
	/** Live spinner handle while `run` is in flight; steps update its text. */
	protected progress: {
		succeed(text: string): void;
		update(text: string): void;
	} | null = null;
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
					action: actionContext(),
					blocking: this.options.blocking,
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
					scopeRequested: this.options.scope,
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
			this.stopProgress();
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

		this.progress?.update("Comparing against the base revision");
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

	/** Ends the spinner so nothing prints through an active frame. */
	protected stopProgress(): void {
		this.progress?.succeed("Scan complete");
		this.progress = null;
	}

	async run(): Promise<void> {
		this.progress = this.options.isMachineReadable
			? null
			: spinner("Scanning...").start();

		for (const step of this.steps) {
			await step();
		}

		this.stopProgress();
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
	private readonly allFiles: string[] = [];
	private readonly allProviders: ReportProvider[] = [];
	private result!: MonorepoEngineResult;
	private scanStartTime!: number;

	/** What the post-scan menu needs, without re-scanning. */
	get interactiveArtifacts(): InteractiveArtifacts {
		return {
			buildReportHtml: () => {
				const { moduleGraphs, result } = this.result;
				return buildHtmlReport(
					mergeModuleGraphs(moduleGraphs),
					result.combined,
					{
						bootstrapRoots: this.bootstrapRoots,
						files: this.allFiles,
						projects: [...moduleGraphs.keys()],
						providers: this.allProviders,
					}
				);
			},
			result: this.result.result.combined,
		};
	}

	constructor(
		targetPath: string,
		monorepo: MonorepoInfo,
		options: PipelineOptions
	) {
		super(targetPath, options);
		this.monorepo = monorepo;
	}

	private projectLabel = "";

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
				async (name, context: AnalysisContext) => {
					if (context.config?.telemetry === false) {
						this.subProjectOptOut = true;
					}
					const label = this.projectLabel || name;
					this.allFiles.push(...context.files);
					for (const root of collectEntryModules(
						context.astProject,
						context.files,
						context.moduleGraph
					)) {
						this.bootstrapRoots.push(`${name}/${root}`);
					}
					for (const provider of context.providers.values()) {
						const owner = context.moduleGraph.providerToModule.get(
							provider.name
						);
						this.allProviders.push(
							toReportProvider(provider, {
								project: name,
								module: owner ? `${name}/${owner.name}` : undefined,
							})
						);
					}
					const rawOutput = await diagnose(context, (checked, total) => {
						this.progress?.update(
							`${label} — running rules ${renderProgressBar(checked, total)}`
						);
					});
					const scanResult = buildResult(context, rawOutput);
					return {
						...scanResult,
						moduleGraph: detachModuleGraph(scanResult.moduleGraph),
						providers: new Map(),
					};
				},
				(name, index, total) => {
					this.projectLabel = `${name} (${index}/${total})`;
					this.progress?.update(`${this.projectLabel} — collecting files`);
				},
				(_name, phase, parsed, total) => {
					this.progress?.update(
						`${this.projectLabel} — ${analysisText(phase, parsed, total).toLowerCase()}`
					);
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

	/** What the post-scan menu needs, without re-scanning. */
	get interactiveArtifacts(): InteractiveArtifacts {
		return {
			buildReportHtml: () => {
				const { moduleGraph, files, providers } = this.result;
				return buildHtmlReport(moduleGraph, this.result.result, {
					bootstrapRoots: [
						...collectEntryModules(this.context.astProject, files, moduleGraph),
					],
					files,
					providers: [...providers.values()].map((provider) =>
						toReportProvider(provider, {
							module: moduleGraph.providerToModule.get(provider.name)?.name,
						})
					),
				});
			},
			result: this.result.result,
		};
	}

	buildContext(): this {
		this.steps.push(async () => {
			this.context = await buildAnalysisContext(
				this.targetPath,
				this.scanConfig,
				(phase, parsed, total) => {
					this.progress?.update(analysisText(phase, parsed, total));
				}
			);
		});
		return this;
	}

	runRules(): this {
		this.steps.push(async () => {
			this.rawOutput = await diagnose(this.context, (checked, total) => {
				this.progress?.update(
					`Running rules ${renderProgressBar(checked, total)}`
				);
			});
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
