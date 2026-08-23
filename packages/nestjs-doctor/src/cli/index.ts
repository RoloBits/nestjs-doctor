import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import {
	detectMonorepo,
	looksLikeMonorepo,
} from "../engine/project-detector.js";
import { flags } from "./flags.js";
import { setCliVersion } from "./output.js";
import { MonorepoPipeline, SingleProjectPipeline } from "./pipeline.js";
import { type CliArgs, CliSetup } from "./setup.js";
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

	const monorepo = await detectMonorepo(targetPath);
	if (monorepo) {
		await new MonorepoPipeline(targetPath, monorepo, options)
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.applyScope()
			.warnCustomRules()
			.output()
			.run();
		return;
	}

	if (await looksLikeMonorepo(targetPath)) {
		console.warn(
			"Warning: This directory appears to be a monorepo, but no NestJS packages were found.\nConsider running on a specific sub-project instead."
		);
	}

	await new SingleProjectPipeline(targetPath, options)
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.applyScope()
		.warnCustomRules()
		.output()
		.run();
}

runMain(main);
