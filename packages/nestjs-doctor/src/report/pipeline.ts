import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
	reportScanTelemetry,
	type ScanTelemetryInput,
} from "../cli/scan-telemetry-reporter.js";
import type { ReportProvider, SourceInclusion } from "../common/artifact.js";
import type { Diagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import {
	detachModuleGraph,
	type ModuleGraph,
	mergeModuleGraphs,
} from "../engine/graph/module-graph.js";
import { pruneCrossProjectOrphans } from "../engine/orphan-prune.js";
import type { MonorepoInfo } from "../engine/project-detector.js";
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
import { reportTelemetryEnabled } from "../telemetry/send.js";
import { spinner } from "../ui/spinner.js";
import { buildReportArtifact, collectScanFacts } from "./artifact.js";
import { buildHtmlReport } from "./html-report.js";
import type { LoadedBootTrace } from "./timings.js";

type PipelineStep = () => void | Promise<void>;

/** Abstract base for report pipelines — shared step queue and config */
abstract class ReportPipeline {
	protected _html!: string;
	protected scanConfig!: ScanConfig;
	/** One id per report, shared by the artifact and the beacon it embeds. */
	protected readonly scanId = randomUUID();
	protected readonly sources: SourceInclusion;
	/** Marks when this pipeline was constructed, for the total wall time. */
	protected readonly startedAt = performance.now();
	protected readonly steps: PipelineStep[] = [];
	/** Set when any scanned sub-project declares its own opt-out. */
	protected subProjectOptOut = false;
	protected readonly targetPath: string;
	protected readonly telemetry: boolean;
	/** Injectables handed to `reportScanTelemetry`; tests replace the sender. */
	protected telemetryOverrides: Partial<ScanTelemetryInput> = {};
	protected readonly traces: LoadedBootTrace[] | undefined;
	protected readonly version: string;

	private readonly configPath: string | undefined;

	constructor(
		targetPath: string,
		configPath: string | undefined,
		version: string,
		traces?: LoadedBootTrace[],
		telemetry = true,
		sources: SourceInclusion = "all"
	) {
		this.targetPath = targetPath;
		this.configPath = configPath;
		this.version = version;
		this.traces = traces;
		this.telemetry = telemetry;
		this.sources = sources;
	}

	/**
	 * The flag, `DO_NOT_TRACK`, `telemetry: false`, and `report.telemetry: false`
	 * each disable the beacon on their own.
	 */
	protected get telemetryEnabled(): boolean {
		return (
			reportTelemetryEnabled(this.telemetry, this.scanConfig?.config) &&
			!this.subProjectOptOut
		);
	}

	/**
	 * Reports the scan this report was built from, under the same id the
	 * embedded beacon carries. A failure here leaves the report untouched.
	 */
	protected reportScan(
		diagnostics: Diagnostic[],
		result: DiagnoseResult,
		fileCount: number,
		monorepo: boolean,
		totalMs: number,
		suppressed: Record<string, number>
	): void {
		reportScanTelemetry({
			blocking: "error",
			diagnostics,
			fileCount,
			monorepo,
			optionsTelemetry: this.telemetry,
			outputFormat: "report",
			result,
			scanConfig: this.scanConfig,
			scanId: this.scanId,
			scopeRequested: "full",
			subProjectOptOut: this.subProjectOptOut,
			suppressed,
			targetPath: this.targetPath,
			totalMs,
			...this.telemetryOverrides,
		});
	}

	abstract buildContext(): this;
	abstract runRules(): this;
	abstract buildResult(): this;
	abstract generateHtml(): this;

	get generatedHtml(): string {
		return this._html;
	}

	resolveConfig(): this {
		this.steps.push(async () => {
			this.scanConfig = await resolveScanConfig(
				this.targetPath,
				this.configPath
			);
		});
		return this;
	}

	async run(): Promise<void> {
		const progress = spinner("Generating report...").start();

		try {
			for (const step of this.steps) {
				await step();
			}
		} catch (error) {
			progress.error("Report failed");
			throw error;
		}

		progress.success("Report generated");
	}
}

/** Single-project report pipeline */
export class SingleProjectReportPipeline extends ReportPipeline {
	private context!: AnalysisContext;
	private rawOutput!: RawDiagnosticOutput;
	private _scanResult!: EngineResult;

	get scanResult(): EngineResult {
		return this._scanResult;
	}

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
		this.steps.push(async () => {
			this.rawOutput = await diagnose(this.context);
		});
		return this;
	}

	buildResult(): this {
		this.steps.push(() => {
			this._scanResult = buildResult(
				this.context,
				this.rawOutput,
				this.scanConfig.customRuleWarnings
			);
			this.reportScan(
				this.rawOutput.diagnostics,
				this._scanResult.result,
				this.context.files.length,
				false,
				performance.now() - this.startedAt,
				this.rawOutput.suppressed
			);
		});
		return this;
	}

	generateHtml(): this {
		this.steps.push(() => {
			const { moduleGraph, result, files, providers } = this._scanResult;
			const facts = collectScanFacts({
				astProject: this.context.astProject,
				files,
				moduleGraph,
				providers,
			});
			this._html = buildHtmlReport(
				buildReportArtifact({
					targetPath: this.targetPath,
					moduleGraph,
					result,
					files,
					bootstrapRoots: facts.bootstrapRoots,
					providers: facts.providers,
					scanId: this.scanId,
					sources: this.sources,
					traces: this.traces,
					version: this.version,
				}),
				{ telemetry: this.telemetryEnabled }
			);
		});
		return this;
	}
}

/** Monorepo report pipeline */
export class MonorepoReportPipeline extends ReportPipeline {
	private readonly monorepo: MonorepoInfo;
	private scanResults!: Map<string, EngineResult>;
	private readonly allFiles: string[] = [];
	private readonly allProviders: ReportProvider[] = [];
	private readonly bootstrapRoots: string[] = [];
	private _monoResult!: MonorepoEngineResult;
	private _mergedGraph?: ModuleGraph;
	private scanStartTime!: number;
	/** Inline-suppression counts summed across every sub-project. */
	private readonly suppressedInline: Record<string, number> = {};

	constructor(
		targetPath: string,
		configPath: string | undefined,
		monorepo: MonorepoInfo,
		version: string,
		traces?: LoadedBootTrace[],
		telemetry = true,
		sources: SourceInclusion = "all"
	) {
		super(targetPath, configPath, version, traces, telemetry, sources);
		this.monorepo = monorepo;
	}

	get monoResult(): MonorepoEngineResult {
		return this._monoResult;
	}

	get mergedGraph(): ModuleGraph | undefined {
		return this._mergedGraph;
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
				async (name, context: AnalysisContext) => {
					if (context.config?.telemetry === false) {
						this.subProjectOptOut = true;
					}
					this.allFiles.push(...context.files);
					const facts = collectScanFacts({ ...context, projectName: name });
					this.bootstrapRoots.push(...facts.bootstrapRoots);
					this.allProviders.push(...facts.providers);
					const rawOutput = await diagnose(context);
					for (const [id, n] of Object.entries(rawOutput.suppressed)) {
						this.suppressedInline[id] = (this.suppressedInline[id] ?? 0) + n;
					}
					const scanResult = buildResult(context, rawOutput);
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
			this._mergedGraph = pruneCrossProjectOrphans(
				this.scanResults,
				this.bootstrapRoots
			);
			const totalElapsedMs = performance.now() - this.scanStartTime;
			this._monoResult = buildMonorepoResult(
				this.scanResults,
				this.scanConfig.customRuleWarnings,
				totalElapsedMs
			);
			const combined = this._monoResult.result.combined;
			this.reportScan(
				combined.diagnostics,
				combined,
				combined.project.fileCount,
				true,
				performance.now() - this.startedAt,
				this.suppressedInline
			);
		});
		return this;
	}

	generateHtml(): this {
		this.steps.push(() => {
			const { moduleGraphs, result } = this._monoResult;
			const merged = this._mergedGraph ?? mergeModuleGraphs(moduleGraphs);
			const projects = [...moduleGraphs.keys()];

			this._html = buildHtmlReport(
				buildReportArtifact({
					targetPath: this.targetPath,
					moduleGraph: merged,
					result: result.combined,
					projects,
					files: this.allFiles,
					providers: this.allProviders,
					bootstrapRoots: this.bootstrapRoots,
					monorepo: true,
					scanId: this.scanId,
					sources: this.sources,
					traces: this.traces,
					version: this.version,
				}),
				{ telemetry: this.telemetryEnabled }
			);
		});
		return this;
	}
}
