import { performance } from "node:perf_hooks";
import type { MonorepoInfo } from "../engine/project-detector.js";
import {
	type AnalysisContext,
	buildAnalysisContext,
	buildMonorepoContext,
	buildMonorepoResult,
	buildResult,
	diagnose,
	type EngineResult,
	type MonorepoContext,
	type MonorepoEngineResult,
	type RawDiagnosticOutput,
	resolveScanConfig,
	type ScanConfig,
} from "../engine/scanner.js";
import { resolveMinScore } from "./min-score.js";
import { outputMonorepoResults, outputSingleProjectResults } from "./output.js";
import { logger } from "./ui/logger.js";
import { spinner } from "./ui/spinner.js";

interface PipelineOptions {
	configPath: string | undefined;
	isMachineReadable: boolean;
	json: boolean;
	minScore: string | undefined;
	score: boolean;
	verbose: boolean;
}

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

/** Abstract base for scan pipelines — shared step queue, config, and warnings */
abstract class ScanPipeline {
	protected readonly options: PipelineOptions;
	protected resolvedMinimumScore: number | undefined;
	protected scanConfig!: ScanConfig;
	protected readonly steps: PipelineStep[] = [];
	protected readonly targetPath: string;

	constructor(targetPath: string, options: PipelineOptions) {
		this.targetPath = targetPath;
		this.options = options;
	}

	abstract buildContext(): this;
	abstract runRules(): this;
	abstract buildResult(): this;
	abstract output(): this;

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

/** Monorepo scan builder — resolveConfig, buildContext, runRules, buildResult, warn, output */
export class MonorepoPipeline extends ScanPipeline {
	private readonly monorepo: MonorepoInfo;
	private monorepoCtx!: MonorepoContext;
	private readonly rawOutputs = new Map<string, RawDiagnosticOutput>();
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
				this.rawOutputs.set(name, diagnose(context));
			}
		});
		return this;
	}

	buildResult(): this {
		this.steps.push(() => {
			const totalElapsedMs = performance.now() - this.scanStartTime;
			this.result = buildMonorepoResult(
				this.monorepoCtx,
				this.rawOutputs,
				this.scanConfig.customRuleWarnings,
				totalElapsedMs
			);
		});
		return this;
	}

	output(): this {
		this.steps.push(() => {
			outputMonorepoResults(
				this.result,
				this.resolvedMinimumScore,
				this.options.isMachineReadable,
				{
					json: this.options.json,
					score: this.options.score,
					verbose: this.options.verbose,
				}
			);
		});
		return this;
	}
}

/** Single-project scan builder — resolveConfig, buildContext, runRules, buildResult, warn, output */
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

	output(): this {
		this.steps.push(() => {
			outputSingleProjectResults(
				this.result,
				this.resolvedMinimumScore,
				this.options.isMachineReadable,
				{
					json: this.options.json,
					score: this.options.score,
					verbose: this.options.verbose,
				}
			);
		});
		return this;
	}
}
