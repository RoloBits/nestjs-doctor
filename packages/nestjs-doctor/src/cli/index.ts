import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import {
	detectMonorepo,
	looksLikeMonorepo,
} from "../engine/project-detector.js";
import { flags } from "./flags.js";
import { setCliVersion } from "./output.js";
import {
	type InteractiveArtifacts,
	MonorepoPipeline,
	SingleProjectPipeline,
} from "./pipeline.js";
import { type CliArgs, CliSetup } from "./setup.js";
import { canPrompt } from "./ui/environment.js";
import { logger } from "./ui/logger.js";

const CONFIG_ERROR_EXIT_CODE = 2;

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const main = defineCommand({
	meta: {
		name: "nestjs-doctor",
		version,
		description:
			"Static analysis tool for NestJS — health score, diagnostics, and interactive HTML report.\nCommands: ci install (scaffold .github/workflows/nestjs-doctor.yml)",
	},
	args: {
		path: {
			type: "positional",
			description: "Path to the NestJS project (defaults to current directory)",
			default: ".",
			required: false,
		},
		...flags,
	},
	async run({ args }) {
		setCliVersion(version);
		try {
			await scan(args as CliArgs);
		} catch (error) {
			// citty prints a raw stack, so a bad config is caught here first.
			logger.error(error instanceof Error ? error.message : String(error));
			process.exit(CONFIG_ERROR_EXIT_CODE);
		}
	},
});

async function scan(args: CliArgs): Promise<void> {
	const ctx = await new CliSetup(args, version)
		.resolveTargetPath()
		.handleListRules()
		.handleCiInstall()
		.validateTargetPath()
		.handleInit()
		.handleReport()
		.validateMinScore()
		.validateBlocking()
		.run();

	if (!ctx) {
		return;
	}

	const { targetPath, options } = ctx;
	options.interactive = canPrompt(options);

	const runMenu = async (artifacts: InteractiveArtifacts) => {
		if (!options.interactive) {
			return;
		}
		const { runInteractiveApp } = await import("./interactive/tui/run.js");
		await runInteractiveApp({
			buildReportHtml: artifacts.buildReportHtml,
			result: artifacts.result,
			subProjects: artifacts.subProjects?.map(({ name, result }) => ({
				errors: result.summary.errors,
				fileCount: result.project.fileCount,
				info: result.summary.info,
				name,
				score: result.score.value,
				warnings: result.summary.warnings,
			})),
			targetPath,
			version,
		});
		// The TUI drew in the alternate screen; leave the score box behind.
		artifacts.printSummary();
		logger.log("Done.");
	};

	const monorepo = await detectMonorepo(targetPath);
	if (monorepo) {
		const pipeline = new MonorepoPipeline(targetPath, monorepo, options);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.applyScope()
			.warnCustomRules()
			.output()
			.run();
		await runMenu(pipeline.interactiveArtifacts);
		return;
	}

	if (await looksLikeMonorepo(targetPath)) {
		console.warn(
			"Warning: This directory appears to be a monorepo, but no NestJS packages were found.\nConsider running on a specific sub-project instead."
		);
	}

	const pipeline = new SingleProjectPipeline(targetPath, options);
	await pipeline
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.applyScope()
		.warnCustomRules()
		.output()
		.run();
	await runMenu(pipeline.interactiveArtifacts);
}

runMain(main);
