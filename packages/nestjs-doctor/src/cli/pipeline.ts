import { performance } from "node:perf_hooks";
import type { ReportArtifact, ReportProvider } from "../common/artifact.js";
import type { Diagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import { computeBaselineDelta } from "../engine/baseline.js";
import {
	detachModuleGraph,
	mergeModuleGraphs,
} from "../engine/graph/module-graph.js";
import { pruneCrossProjectOrphans } from "../engine/orphan-prune.js";
import type { MonorepoInfo } from "../engine/project-detector.js";
import { withScopedDiagnostics } from "../engine/result-builder.js";
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
import { buildReportArtifact, collectScanFacts } from "../report/artifact.js";
import { buildHtmlReport } from "../report/html-report.js";
import { resetEcosystem } from "../telemetry/ecosystem.js";
import { logger } from "../ui/logger.js";
import {
	printConsoleReport,
	printMonorepoReport,
} from "./formatters/console-reporter.js";
import { summarizeWarnings } from "./formatters/warning-summary.js";
import { resolveMinScore } from "./min-score.js";
import {
	getCliVersion,
	outputMonorepoResults,
	outputSingleProjectResults,
} from "./output.js";
import type { ScanOutcome, ScanWorkerRequest } from "./worker-delegate.js";
import {
	canDelegateToWorker,
	runInWorker,
	setWorkerUrl as storeWorkerUrl,
} from "./worker-delegate.js";

// ScanOutcome lives in worker-delegate.ts; nothing imported it from here.
export type {
	ScanWorkerMessage,
	ScanWorkerRequest,
} from "./worker-delegate.js";

import { watchCancellation } from "./cancellation-watcher.js";
import { reportScanTelemetry } from "./scan-telemetry-reporter.js";
import { type PipelineOptions, toScanOptions } from "./setup.js";
import { createAnimatedProgress } from "./ui/animated-progress.js";

type PipelineStep = () => void | Promise<void>;

const analysisLabel = (phase: AnalysisPhase): string => {
	if (phase === "collecting") {
		return "Collecting files";
	}
	if (phase === "parsing") {
		return "Parsing files";
	}
	return "Analyzing the project";
};

/** Handed to the post-scan menu so its actions reuse the finished scan. */
export interface InteractiveArtifacts {
	buildReportHtml: () => string;
	/** The serialized module graph, for sharing the modules section. */
	moduleGraph: () => ReportArtifact["graph"];
	/** Prints the persistent score box after the TUI leaves the alt screen. */
	printSummary: () => void;
	result: DiagnoseResult;
	/** Per-project results in a monorepo, for the score screen's breakdown. */
	subProjects?: { name: string; result: DiagnoseResult }[];
}

const displayCustomRuleWarnings = (
	warnings: string[],
	isMachineReadable: boolean,
	verbose: boolean
): void => {
	if (isMachineReadable) {
		return;
	}
	for (const warning of summarizeWarnings(warnings, verbose)) {
		logger.warn(warning);
	}
};

/** Points the pipelines at the worker entry. */
export const setScanWorkerUrl = (url: URL | null): void => {
	ScanPipeline.setWorkerUrl(url);
};

/** Abstract base for scan pipelines — shared step queue, config, scoping, warnings */
abstract class ScanPipeline {
	protected readonly options: PipelineOptions;
	protected resolvedMinimumScore: number | undefined;
	protected scanConfig!: ScanConfig;
	/** Live progress line while `run` is in flight; steps update its label. */
	protected progress: {
		fail(text: string): void;
		succeed(text: string): void;
		update(label: string, done?: number, total?: number): void;
	} | null = null;
	/** The final step; in worker mode main runs it after the outcome lands. */
	protected outputStep: PipelineStep | null = null;
	/** Custom-rule warnings from the worker outcome, shown before the report. */
	protected workerWarnings: string[] = [];
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
		reportScanTelemetry({
			blocking: this.options.blocking,
			diagnostics,
			fileCount,
			monorepo,
			optionsTelemetry: this.options.telemetry,
			result,
			scanConfig: this.scanConfig,
			scopeRequested: this.options.scope,
			subProjectOptOut: this.subProjectOptOut,
			targetPath: this.targetPath,
		});
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
			if (this.options.skipOutput) {
				return;
			}
			this.stopProgress();
			displayCustomRuleWarnings(
				this.scanConfig.customRuleWarnings,
				this.options.isMachineReadable,
				this.options.verbose
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

		this.emitProgress("Comparing against the base revision");
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

	/** Phases with a count animate the bar; the rest show the label alone. */
	protected updateAnalysisProgress(
		phase: AnalysisPhase,
		parsed?: number,
		total?: number,
		prefix?: string
	): void {
		const base = analysisLabel(phase);
		const label = prefix ? `${prefix} — ${base.toLowerCase()}` : base;
		if (phase === "parsing") {
			this.emitProgress(label, parsed ?? 0, total ?? 0);
		} else if (phase === "analyzing" && total) {
			this.emitProgress(label, parsed ?? 0, total);
		} else {
			this.emitProgress(label);
		}
	}

	/** Subclass hook: runs the engine middle, then the main-side tail. */
	protected delegate(): Promise<void> {
		return Promise.resolve();
	}

	/** One funnel for every progress update, wherever the scan runs. */
	protected emitProgress(label: string, done?: number, total?: number): void {
		this.progress?.update(label, done, total);
		this.options.onProgress?.(label, done, total);
	}

	/** Location of the scan worker entry, injected by the CLI. */
	static setWorkerUrl(url: URL | null): void {
		storeWorkerUrl(url);
	}

	/** Injected by the CLI entry; null until then. */
	protected canDelegate(): Promise<boolean> {
		return canDelegateToWorker({
			hasOutputStep: this.outputStep !== null,
			interactive: this.options.interactive,
			isMachineReadable: this.options.isMachineReadable,
		});
	}

	protected runViaWorker(
		request: ScanWorkerRequest,
		apply: (outcome: ScanOutcome) => void
	): Promise<void> {
		return runInWorker(request, apply, {
			emitProgress: (label, done, total) => {
				this.emitProgress(label, done, total);
			},
		});
	}

	async run(): Promise<void> {
		this.progress = this.options.isMachineReadable
			? null
			: createAnimatedProgress("Scanning...");
		// Raw mode turns Ctrl+C into a 0x03 byte; watch for both it and SIGINT.
		const cancel = (): void => {
			this.progress?.fail("Scan cancelled");
			this.progress = null;
			logger.warn("Scan cancelled.");
			process.exit(130);
		};
		const stopWatching = watchCancellation({ onInterrupt: cancel });
		try {
			if (await this.canDelegate()) {
				try {
					await this.delegate();
				} catch (error) {
					this.progress?.fail("Worker scan failed");
					this.progress = null;
					logger.warn(
						`The scan worker failed (${error instanceof Error ? error.message : String(error)}); scanning in process instead.`
					);
					if (!this.options.isMachineReadable) {
						this.progress = createAnimatedProgress("Scanning...");
					}
					for (const step of this.steps) {
						await step();
					}
					return;
				}
				this.stopProgress();
				displayCustomRuleWarnings(
					this.workerWarnings,
					this.options.isMachineReadable,
					this.options.verbose
				);
				await this.outputStep?.();
				return;
			}
			for (const step of this.steps) {
				await step();
			}
		} catch (error) {
			this.progress?.fail("Scan failed");
			this.progress = null;
			throw error;
		} finally {
			stopWatching();
			this.stopProgress();
		}
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
	private cachedArtifact: ReportArtifact | undefined;

	/** The scan as one serializable document, built once on demand. */
	get reportArtifact(): ReportArtifact {
		if (!this.cachedArtifact) {
			const { moduleGraphs, result } = this.result;
			this.cachedArtifact = buildReportArtifact({
				targetPath: this.targetPath,
				moduleGraph: mergeModuleGraphs(moduleGraphs),
				result: result.combined,
				projects: [...moduleGraphs.keys()],
				files: this.allFiles,
				providers: this.allProviders,
				bootstrapRoots: this.bootstrapRoots,
				monorepo: true,
				sources: this.options.sources,
				traces: this.options.traces,
				version: getCliVersion(),
			});
		}
		return this.cachedArtifact;
	}

	/** What the post-scan menu needs, without re-scanning. */
	get interactiveArtifacts(): InteractiveArtifacts {
		return {
			buildReportHtml: () => buildHtmlReport(this.reportArtifact),
			moduleGraph: () => this.reportArtifact.graph,
			printSummary: () => {
				printMonorepoReport(this.result.result, this.options.verbose, true);
			},
			result: this.result.result.combined,
			subProjects: this.result.result.subProjects.map(({ name, result }) => ({
				name,
				result,
			})),
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
					const facts = collectScanFacts({ ...context, projectName: name });
					this.bootstrapRoots.push(...facts.bootstrapRoots);
					this.allProviders.push(...facts.providers);
					const rawOutput = await diagnose(context, (checked, total) => {
						this.emitProgress(`${label} — running rules`, checked, total);
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
					this.emitProgress(`${this.projectLabel} — collecting files`);
				},
				(_name, phase, parsed, total) => {
					this.updateAnalysisProgress(phase, parsed, total, this.projectLabel);
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

	/** Runs the engine middle in a worker; main keeps only the report. */
	protected delegate(): Promise<void> {
		return this.runViaWorker(
			{
				kind: "monorepo",
				targetPath: this.targetPath,
				options: toScanOptions(this.options),
				monorepo: this.monorepo,
				version: getCliVersion(),
			},
			(outcome) => {
				if (outcome.kind !== "monorepo") {
					throw new Error("unexpected scan outcome");
				}
				this.workerWarnings = outcome.customRuleWarnings;
				this.result = {
					customRuleWarnings: outcome.customRuleWarnings,
					moduleGraphs: outcome.moduleGraphs,
					result: outcome.result,
				};
				this.allFiles.push(...outcome.allFiles);
				this.allProviders.push(...outcome.reportProviders);
				this.bootstrapRoots.push(...outcome.bootstrapRoots);
				this.subProjectOptOut = outcome.subProjectOptOut;
				this.scopeWarnings.push(...outcome.scopeWarnings);
				this.resolvedMinimumScore = outcome.resolvedMinimumScore;
			}
		);
	}

	/** What the worker posts back after the engine steps finish. */
	get workerOutcome(): ScanOutcome {
		return {
			kind: "monorepo",
			customRuleWarnings: this.result.customRuleWarnings,
			moduleGraphs: this.result.moduleGraphs,
			result: this.result.result,
			reportProviders: this.allProviders,
			bootstrapRoots: this.bootstrapRoots,
			allFiles: this.allFiles,
			subProjectOptOut: this.subProjectOptOut,
			scopeWarnings: this.scopeWarnings,
			resolvedMinimumScore: this.resolvedMinimumScore,
		};
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
		if (this.options.skipOutput) {
			return this;
		}
		const step: PipelineStep = () =>
			outputMonorepoResults(
				this.result,
				this.resolvedMinimumScore,
				this.targetPath,
				this.options,
				this.scopeWarnings,
				() => this.reportArtifact
			);
		this.steps.push(step);
		this.outputStep = step;
		return this;
	}
}

/** Single-project scan builder — resolveConfig, buildContext, runRules, buildResult, applyScope, warn, output */
export class SingleProjectPipeline extends ScanPipeline {
	private context!: AnalysisContext;
	private rawOutput!: RawDiagnosticOutput;
	private result!: EngineResult;
	private reportProviders: ReportProvider[] = [];
	private bootstrapRoots: string[] = [];
	private cachedArtifact: ReportArtifact | undefined;

	/** The scan as one serializable document, built once on demand. */
	get reportArtifact(): ReportArtifact {
		if (!this.cachedArtifact) {
			const { moduleGraph, files, result } = this.result;
			this.cachedArtifact = buildReportArtifact({
				targetPath: this.targetPath,
				moduleGraph,
				result,
				files,
				providers: this.reportProviders,
				bootstrapRoots: this.bootstrapRoots,
				sources: this.options.sources,
				traces: this.options.traces,
				version: getCliVersion(),
			});
		}
		return this.cachedArtifact;
	}

	/** What the post-scan menu needs, without re-scanning. */
	get interactiveArtifacts(): InteractiveArtifacts {
		return {
			buildReportHtml: () => buildHtmlReport(this.reportArtifact),
			moduleGraph: () => this.reportArtifact.graph,
			printSummary: () => {
				printConsoleReport(this.result.result, this.options.verbose, true);
			},
			result: this.result.result,
		};
	}

	/** Runs the engine middle in a worker; main keeps only the report. */
	protected delegate(): Promise<void> {
		return this.runViaWorker(
			{
				kind: "single",
				targetPath: this.targetPath,
				options: toScanOptions(this.options),
				version: getCliVersion(),
			},
			(outcome) => {
				if (outcome.kind !== "single") {
					throw new Error("unexpected scan outcome");
				}
				this.workerWarnings = outcome.customRuleWarnings;
				this.result = {
					customRuleWarnings: outcome.customRuleWarnings,
					files: outcome.files,
					moduleGraph: outcome.moduleGraph,
					providers: new Map(),
					result: outcome.result,
					schemaGraph: outcome.schemaGraph,
				};
				this.reportProviders = outcome.reportProviders;
				this.bootstrapRoots = outcome.bootstrapRoots;
				this.scopeWarnings.push(...outcome.scopeWarnings);
				this.resolvedMinimumScore = outcome.resolvedMinimumScore;
			}
		);
	}

	/** What the worker posts back after the engine steps finish. */
	get workerOutcome(): ScanOutcome {
		return {
			kind: "single",
			customRuleWarnings: this.result.customRuleWarnings,
			files: this.result.files,
			moduleGraph: this.result.moduleGraph,
			reportProviders: this.reportProviders,
			bootstrapRoots: this.bootstrapRoots,
			result: this.result.result,
			schemaGraph: this.result.schemaGraph,
			scopeWarnings: this.scopeWarnings,
			resolvedMinimumScore: this.resolvedMinimumScore,
		};
	}

	buildContext(): this {
		this.steps.push(async () => {
			this.context = await buildAnalysisContext(
				this.targetPath,
				this.scanConfig,
				(phase, parsed, total) => {
					this.updateAnalysisProgress(phase, parsed, total);
				}
			);
		});
		return this;
	}

	runRules(): this {
		this.steps.push(async () => {
			this.rawOutput = await diagnose(this.context, (checked, total) => {
				this.emitProgress("Running rules", checked, total);
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
			// Read from the live graph; the detach below strips the rest.
			const facts = collectScanFacts({
				astProject: this.context.astProject,
				files: this.result.files,
				moduleGraph: this.result.moduleGraph,
				providers: this.result.providers,
			});
			this.bootstrapRoots = facts.bootstrapRoots;
			this.reportProviders = facts.providers;
			this.result = {
				...this.result,
				moduleGraph: detachModuleGraph(this.result.moduleGraph),
			};
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
		if (this.options.skipOutput) {
			return this;
		}
		const step: PipelineStep = () =>
			outputSingleProjectResults(
				this.result,
				this.resolvedMinimumScore,
				this.targetPath,
				this.options,
				this.scopeWarnings,
				() => this.reportArtifact
			);
		this.steps.push(step);
		this.outputStep = step;
		return this;
	}
}
