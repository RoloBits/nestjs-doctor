import { resolve } from "node:path";
import { validateMinScoreArg } from "./min-score.js";
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

/** Setup builder — resolves target path, handles early-exit flags, validates args */
export class CliSetup {
	private readonly args: CliArgs;
	private readonly steps: SetupStep[] = [];
	private readonly version: string;
	private targetPath = "";

	constructor(args: CliArgs, version: string) {
		this.args = args;
		this.version = version;
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
				const { initSkill } = await import("./init.js");
				await initSkill(this.targetPath, this.version);
				return false;
			}
			return true;
		});
		return this;
	}

	handleReport(): this {
		this.steps.push(async () => {
			if (this.args.report) {
				const { runReport } = await import("../report/setup.js");
				await runReport(this.targetPath, this.args.config);
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
