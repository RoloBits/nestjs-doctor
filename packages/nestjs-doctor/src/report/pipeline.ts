import { performance } from "node:perf_hooks";
import { spinner } from "../cli/ui/spinner.js";
import { mergeModuleGraphs } from "../engine/module-graph.js";
import type { MonorepoInfo } from "../engine/project-detector.js";
import {
	buildMonorepoContext,
	buildMonorepoResult,
	buildScanContext,
	buildScanResult,
	type MonorepoContext,
	type MonorepoScanResult,
	type RawScanOutput,
	resolveScanConfig,
	runRules,
	type ScanConfig,
	type ScanContext,
	type ScanResult,
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
	private context!: ScanContext;
	private rawOutput!: RawScanOutput;
	private _scanResult!: ScanResult;

	get scanResult(): ScanResult {
		return this._scanResult;
	}

	buildContext(): this {
		this.steps.push(async () => {
			this.context = await buildScanContext(this.targetPath, this.scanConfig);
		});
		return this;
	}

	runRules(): this {
		this.steps.push(() => {
			this.rawOutput = runRules(this.context);
		});
		return this;
	}

	buildResult(): this {
		this.steps.push(() => {
			this._scanResult = buildScanResult(
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
	private monorepoCtx!: MonorepoContext;
	private readonly rawOutputs = new Map<string, RawScanOutput>();
	private _monoResult!: MonorepoScanResult;
	private scanStartTime!: number;

	constructor(
		targetPath: string,
		configPath: string | undefined,
		monorepo: MonorepoInfo
	) {
		super(targetPath, configPath);
		this.monorepo = monorepo;
	}

	get monoResult(): MonorepoScanResult {
		return this._monoResult;
	}

	buildContext(): this {
		this.steps.push(async () => {
			this.scanStartTime = performance.now();
			this.monorepoCtx = await buildMonorepoContext(
				this.targetPath,
				this.scanConfig,
				this.monorepo
			);
		});
		return this;
	}

	runRules(): this {
		this.steps.push(() => {
			for (const [name, context] of this.monorepoCtx.subProjects) {
				this.rawOutputs.set(name, runRules(context));
			}
		});
		return this;
	}

	buildResult(): this {
		this.steps.push(() => {
			const totalElapsedMs = performance.now() - this.scanStartTime;
			this._monoResult = buildMonorepoResult(
				this.monorepoCtx,
				this.rawOutputs,
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
			this._html = buildHtmlReport(merged, result.combined, { projects });
		});
		return this;
	}
}
