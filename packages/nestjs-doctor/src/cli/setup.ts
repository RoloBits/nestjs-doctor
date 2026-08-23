import { resolve } from "node:path";
import { isScopeMode, type ScopeMode } from "../common/scope.js";
import {
	type BlockingLevel,
	resolveBlocking,
	validateBlockingArg,
} from "./blocking.js";
import {
	isMachineReadableFormat,
	type OutputFormat,
	validateFormatArg,
} from "./formatters/render.js";
import { validateMinScoreArg } from "./min-score.js";
import { validateTargetPathArg } from "./target-path.js";
import { logger } from "./ui/logger.js";

export interface PipelineOptions {
	base: string | undefined;
	blocking: BlockingLevel;
	changedFilesFrom: string | undefined;
	configPath: string | undefined;
	format: OutputFormat;
	isMachineReadable: boolean;
	json: boolean;
	jsonCompact: boolean;
	minScore: string | undefined;
	outputPath: string | undefined;
	scope: ScopeMode;
	score: boolean;
	staged: boolean;
	verbose: boolean;
}

interface SetupContext {
	options: PipelineOptions;
	targetPath: string;
}

export interface CliArgs {
	_: string[];
	base: string | undefined;
	blocking: string | undefined;
	"changed-files-from": string | undefined;
	config: string | undefined;
	force: boolean;
	format: string | undefined;
	init: boolean;
	json: boolean;
	"json-compact": boolean;
	"list-rules": boolean;
	"min-score": string | undefined;
	output: string | undefined;
	path: string;
	report: boolean;
	scope: string | undefined;
	score: boolean;
	staged: boolean;
	telemetry: boolean;
	timings: string | undefined;
	verbose: boolean;
}

type SetupStep = () => boolean | Promise<boolean>;

const INVALID_ARG_EXIT_CODE = 2;

/** The error for `--report` beside a flag that names a different output. */
export function reportConflict(args: {
	format?: string;
	json?: boolean;
	score?: boolean;
}): string | null {
	const named = (["format", "json", "score"] as const).filter(
		(flag) => args[flag]
	);
	if (named.length === 0) {
		return null;
	}
	return `--report writes HTML, so it cannot be combined with --${named.join(", --")}. Run them as separate commands.`;
}

function failWith(message: string): never {
	logger.error(message);
	process.exit(INVALID_ARG_EXIT_CODE);
}

/** Resolves the output format. `--format` wins; `--json` maps onto it. */
function resolveFormat(args: CliArgs): OutputFormat {
	if (args.format) {
		const error = validateFormatArg(args.format);
		if (error) {
			failWith(error);
		}
		return args.format as OutputFormat;
	}
	return args.json ? "json" : "console";
}

function resolveScopeMode(args: CliArgs): ScopeMode {
	if (!args.scope) {
		// `--staged` alone means "the files I am about to commit".
		return args.staged ? "files" : "full";
	}
	if (!isScopeMode(args.scope)) {
		failWith(
			`Invalid --scope value: "${args.scope}". Must be one of full, files, lines, changed.`
		);
	}
	return args.scope as ScopeMode;
}

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

	validateTargetPath(): this {
		this.steps.push(() => {
			const error = validateTargetPathArg(this.targetPath);
			if (error) {
				failWith(error);
			}
			return true;
		});
		return this;
	}

	handleListRules(): this {
		this.steps.push(async () => {
			if (this.args["list-rules"]) {
				const { listRules } = await import("./list-rules.js");
				listRules(this.args.json || this.args.format === "json");
				return false;
			}
			return true;
		});
		return this;
	}

	/** `nestjs-doctor ci install` scaffolds the workflow and exits. */
	handleCiInstall(): this {
		this.steps.push(async () => {
			const [group, verb, ...rest] = this.args._ ?? [];
			if (group !== "ci" || !verb) {
				return true;
			}
			if (verb !== "install" || rest.length > 0) {
				const given = [verb, ...rest].join(" ");
				failWith(
					`Unknown command: "ci ${given}". Try: nestjs-doctor ci install`
				);
			}
			const { runCiInstall } = await import("./ci-install.js");
			const code = await runCiInstall(process.cwd(), this.args.force ?? false);
			if (code !== 0) {
				process.exit(code);
			}
			return false;
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
				const conflict = reportConflict(this.args);
				if (conflict) {
					failWith(conflict);
				}
				const { runReport } = await import("../report/setup.js");
				await runReport(
					this.targetPath,
					this.args.config,
					this.args.timings,
					this.args.output,
					this.args.telemetry
				);
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
					failWith(error);
				}
			}
			return true;
		});
		return this;
	}

	validateBlocking(): this {
		this.steps.push(() => {
			if (this.args.blocking !== undefined) {
				const error = validateBlockingArg(this.args.blocking);
				if (error) {
					failWith(error);
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

		if (this.args.timings) {
			logger.warn("--timings is ignored without --report");
		}

		const format = resolveFormat(this.args);
		const score = this.args.score ?? false;
		const isMachineReadable = score || isMachineReadableFormat(format);

		return {
			targetPath: this.targetPath,
			options: {
				base: this.args.base,
				blocking: resolveBlocking(this.args.blocking, isMachineReadable),
				changedFilesFrom: this.args["changed-files-from"],
				configPath: this.args.config,
				format,
				isMachineReadable,
				json: format === "json",
				jsonCompact: this.args["json-compact"] ?? false,
				minScore: this.args["min-score"],
				outputPath: this.args.output,
				scope: resolveScopeMode(this.args),
				score,
				staged: this.args.staged ?? false,
				verbose: this.args.verbose ?? false,
			},
		};
	}
}
