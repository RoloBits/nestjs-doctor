import { resolve } from "node:path";
import { loadConfig } from "../core/config-loader.js";
import type { MonorepoInfo } from "../core/project-detector.js";
import type { MonorepoScanResult, ScanResult } from "../core/scanner.js";
import { initSkill } from "./init.js";
import { resolveMinScore, validateMinScoreArg } from "./min-score.js";
import { outputMonorepoResults, outputSingleProjectResults } from "./output.js";
import { runReportFlow } from "./report/flow.js";
import { scanMonorepoProject, scanSingleProject } from "./scan.js";
import { logger } from "./ui/logger.js";

interface PipelineOptions {
	configPath: string | undefined;
	isMachineReadable: boolean;
	json: boolean;
	minScore: string | undefined;
	score: boolean;
	verbose: boolean;
}

interface SetupContext {
	options: PipelineOptions;
	targetPath: string;
}

export interface CliArgs {
	config: string | undefined;
	init: boolean;
	json: boolean;
	"min-score": string | undefined;
	path: string;
	report: boolean;
	score: boolean;
	verbose: boolean;
}

type SetupStep = () => boolean | Promise<boolean>;
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

const resolveMinimumScore = async (
	targetPath: string,
	options: PipelineOptions
): Promise<number | undefined> => {
	const config = await loadConfig(targetPath, options.configPath);
	return resolveMinScore(options.minScore, config.minScore);
};

/** Setup builder — resolves target path, handles early-exit flags, validates args */
export class CliSetup {
	private readonly args: CliArgs;
	private readonly steps: SetupStep[] = [];
	private targetPath = "";

	constructor(args: CliArgs) {
		this.args = args;
	}

	resolveTargetPath(): this {
		this.steps.push(() => {
			this.targetPath = resolve(this.args.path ?? ".");
			return true;
		});
		return this;
	}

	handleInit(): this {
		this.steps.push(async () => {
			if (this.args.init) {
				await initSkill(this.targetPath);
				return false;
			}
			return true;
		});
		return this;
	}

	handleReport(): this {
		this.steps.push(async () => {
			if (this.args.report) {
				await runReportFlow(this.targetPath, this.args.config);
				return false;
			}
			return true;
		});
		return this;
	}

	validateMinScore(): this {
		this.steps.push(() => {
			if (this.args["min-score"] !== undefined) {
				const error = validateMinScoreArg(this.args["min-score"]);
				if (error) {
					logger.error(error);
					process.exit(2);
				}
			}
			return true;
		});
		return this;
	}

	async run(): Promise<SetupContext | null> {
		for (const step of this.steps) {
			const shouldContinue = await step();
			if (!shouldContinue) {
				return null;
			}
		}

		return {
			targetPath: this.targetPath,
			options: {
				configPath: this.args.config,
				isMachineReadable: this.args.score || this.args.json,
				json: this.args.json ?? false,
				minScore: this.args["min-score"],
				score: this.args.score ?? false,
				verbose: this.args.verbose ?? false,
			},
		};
	}
}

/** Abstract base for scan pipelines — shared step queue, config, and warnings */
abstract class ScanPipeline {
	protected readonly options: PipelineOptions;
	protected resolvedMinimumScore: number | undefined;
	protected abstract result: { customRuleWarnings: string[] };
	protected readonly steps: PipelineStep[] = [];
	protected readonly targetPath: string;

	constructor(targetPath: string, options: PipelineOptions) {
		this.targetPath = targetPath;
		this.options = options;
	}

	abstract scan(): this;
	abstract output(): this;

	warnCustomRules(): this {
		this.steps.push(() => {
			displayCustomRuleWarnings(
				this.result.customRuleWarnings,
				this.options.isMachineReadable
			);
		});
		return this;
	}

	loadConfig(): this {
		this.steps.push(async () => {
			this.resolvedMinimumScore = await resolveMinimumScore(
				this.targetPath,
				this.options
			);
		});
		return this;
	}

	async run(): Promise<void> {
		for (const step of this.steps) {
			await step();
		}
	}
}

/** Monorepo scan builder — scan, warn, load config, output */
export class MonorepoPipeline extends ScanPipeline {
	private readonly monorepo: MonorepoInfo;
	protected result!: MonorepoScanResult;

	constructor(
		targetPath: string,
		monorepo: MonorepoInfo,
		options: PipelineOptions
	) {
		super(targetPath, options);
		this.monorepo = monorepo;
	}

	scan(): this {
		this.steps.push(async () => {
			this.result = await scanMonorepoProject(
				this.targetPath,
				this.monorepo,
				this.options.configPath,
				this.options.isMachineReadable
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

/** Single-project scan builder — scan, warn, load config, output */
export class SingleProjectPipeline extends ScanPipeline {
	protected result!: ScanResult;

	scan(): this {
		this.steps.push(async () => {
			this.result = await scanSingleProject(
				this.targetPath,
				this.options.configPath,
				this.options.isMachineReadable
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
