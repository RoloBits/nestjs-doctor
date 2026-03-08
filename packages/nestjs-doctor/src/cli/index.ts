import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import { detectMonorepo } from "../core/project-detector.js";
import { flags } from "./flags.js";
import {
	type CliArgs,
	CliSetup,
	MonorepoPipeline,
	SingleProjectPipeline,
} from "./pipeline.js";

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
		const ctx = await new CliSetup(args as CliArgs)
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
				.scan()
				.warnCustomRules()
				.loadConfig()
				.output()
				.run();
			return;
		}

		await new SingleProjectPipeline(targetPath, options)
			.scan()
			.warnCustomRules()
			.loadConfig()
			.output()
			.run();
	},
});

runMain(main);
