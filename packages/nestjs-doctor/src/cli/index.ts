import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import {
	detectMonorepo,
	looksLikeMonorepo,
} from "../engine/project-detector.js";
import { flags } from "./flags.js";
import { MonorepoPipeline, SingleProjectPipeline } from "./pipeline.js";
import { type CliArgs, CliSetup } from "./setup.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const main = defineCommand({
	meta: {
		name: "nestjs-doctor",
		version,
		description:
			"Static analysis tool for NestJS — health score, diagnostics, and interactive HTML report",
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
		const ctx = await new CliSetup(args as CliArgs, version)
			.resolveTargetPath()
			.handleInit()
			.handleReport()
			.validateMinScore()
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
			.warnCustomRules()
			.output()
			.run();
	},
});

runMain(main);
