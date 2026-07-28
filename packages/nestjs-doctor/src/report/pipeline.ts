import { performance } from "node:perf_hooks";
import { spinner } from "../cli/ui/spinner.js";
import {
	detachModuleGraph,
	mergeModuleGraphs,
} from "../engine/graph/module-graph.js";
import type { ProviderInfo } from "../engine/graph/type-resolver.js";
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
import { buildHtmlReport } from "./html-report.js";

type PipelineStep = () => void | Promise<void>;

/** Abstract base for report pipelines — shared step queue and config */
abstract class ReportPipeline {
	protected _html!: string;
	protected scanConfig!: ScanConfig;
	protected readonly steps: PipelineStep[] = [];
	protected readonly targetPath: string;

	private readonly configPath: string | undefined;

	constructor(targetPath: string, configPath: string | undefined) {
		this.targetPath = targetPath;
		this.configPath = configPath;
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

		for (const step of this.steps) {
			await step();
		}

		progress.succeed("Report generated");
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
		this.steps.push(() => {
			this.rawOutput = diagnose(this.context);
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
			this._html = buildHtmlReport(moduleGraph, result, { files, providers });
		});
		return this;
	}
}

/** Monorepo report pipeline */
export class MonorepoReportPipeline extends ReportPipeline {
	private readonly monorepo: MonorepoInfo;
	private scanResults!: Map<string, EngineResult>;
	private readonly allFiles: string[] = [];
	private readonly allProviders = new Map<string, ProviderInfo>();
	private _monoResult!: MonorepoEngineResult;
	private scanStartTime!: number;

	constructor(
		targetPath: string,
		configPath: string | undefined,
		monorepo: MonorepoInfo
	) {
		super(targetPath, configPath);
		this.monorepo = monorepo;
	}

	get monoResult(): MonorepoEngineResult {
		return this._monoResult;
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
				(_name, context: AnalysisContext) => {
					// Copy out what the report needs before the context is dropped.
					// ProviderInfo holds a ts-morph node, so keep only plain fields.
					this.allFiles.push(...context.files);
					for (const [name, info] of context.providers) {
						this.allProviders.set(name, {
							name: info.name,
							filePath: info.filePath,
							dependencies: info.dependencies,
							publicMethodCount: info.publicMethodCount,
						} as ProviderInfo);
					}
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
			const merged = mergeModuleGraphs(moduleGraphs);
			const projects = [...moduleGraphs.keys()];

			this._html = buildHtmlReport(merged, result.combined, {
				projects,
				files: this.allFiles,
				providers: this.allProviders,
			});
		});
		return this;
	}
}
