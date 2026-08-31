import { performance } from "node:perf_hooks";
import type { ReportProvider, SourceInclusion } from "../common/artifact.js";
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
import { scanTelemetryEnabled } from "../telemetry/send.js";
import { spinner } from "../ui/spinner.js";
import { buildReportArtifact, collectScanFacts } from "./artifact.js";
import { buildHtmlReport } from "./html-report.js";
import type { LoadedBootTrace } from "./timings.js";

type PipelineStep = () => void | Promise<void>;

/** Abstract base for report pipelines — shared step queue and config */
abstract class ReportPipeline {
	protected _html!: string;
	protected scanConfig!: ScanConfig;
	protected readonly sources: SourceInclusion;
	protected readonly steps: PipelineStep[] = [];
	protected readonly targetPath: string;
	protected readonly telemetry: boolean;
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
		const config = this.scanConfig?.config;
		return (
			scanTelemetryEnabled(this.telemetry, config, process.env, "always") &&
			config?.report?.telemetry !== false
		);
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
					this.allFiles.push(...context.files);
					const facts = collectScanFacts({ ...context, projectName: name });
					this.bootstrapRoots.push(...facts.bootstrapRoots);
					this.allProviders.push(...facts.providers);
					const scanResult = buildResult(context, await diagnose(context));
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
