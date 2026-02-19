import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineCommand, runMain } from "citty";
import { loadConfig } from "../core/config-loader.js";
import { detectMonorepo } from "../core/project-detector.js";
import { scan, scanMonorepo } from "../core/scanner.js";
import { flags } from "./flags.js";
import {
	checkMinScore,
	resolveMinScore,
	validateMinScoreArg,
} from "./min-score.js";
import {
	printConsoleReport,
	printMonorepoReport,
} from "./output/console-reporter.js";
import { highlighter } from "./output/highlighter.js";
import { printJsonReport } from "./output/json-reporter.js";
import { logger } from "./output/logger.js";
import { spinner } from "./output/spinner.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const main = defineCommand({
	meta: {
		name: "nestjs-doctor",
		version,
		description:
			"Diagnostic CLI tool that scans NestJS codebases and produces a health score",
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
		const targetPath = resolve(args.path ?? ".");
		const isSilent = args.score || args.json;

		// Validate --min-score early
		const rawMinScore = args["min-score"];
		if (rawMinScore !== undefined) {
			const validationError = validateMinScoreArg(rawMinScore);
			if (validationError) {
				logger.error(validationError);
				process.exit(2);
			}
		}

		// Auto-detect monorepo
		const monorepo = await detectMonorepo(targetPath);

		if (monorepo) {
			const scanSpinner = isSilent
				? null
				: spinner(
						`Scanning monorepo (${monorepo.projects.size} projects)...`
					).start();

			const result = await scanMonorepo(targetPath, {
				config: args.config,
			});

			if (scanSpinner) {
				const projectNames = result.subProjects.map((sp) => sp.name).join(", ");
				scanSpinner.succeed(
					`Scanned ${highlighter.info(String(result.combined.project.fileCount))} files across ${highlighter.info(String(result.subProjects.length))} projects (${projectNames})`
				);
			}

			const monorepoConfig = await loadConfig(targetPath, args.config);
			const monorepoMinScore = resolveMinScore(
				rawMinScore,
				monorepoConfig.minScore
			);

			if (args.score) {
				console.log(result.combined.score.value);
				if (!checkMinScore(result.combined.score.value, monorepoMinScore)) {
					process.exit(1);
				}
				return;
			}

			if (args.json) {
				printJsonReport(result.combined);
				if (!checkMinScore(result.combined.score.value, monorepoMinScore)) {
					process.exit(1);
				}
				return;
			}

			printMonorepoReport(result, args.verbose ?? false);

			if (!checkMinScore(result.combined.score.value, monorepoMinScore)) {
				logger.error(
					`Score ${result.combined.score.value} is below the minimum threshold of ${monorepoMinScore}.`
				);
				process.exit(1);
			}

			if (result.combined.summary.errors > 0) {
				process.exit(1);
			}
			return;
		}

		// Standard single-project scan
		const scanSpinner = isSilent ? null : spinner("Scanning...").start();

		const result = await scan(targetPath, {
			config: args.config,
		});

		if (scanSpinner) {
			const { project } = result;
			const detailParts = [
				`Scanned ${highlighter.info(String(project.fileCount))} files`,
			];
			if (project.nestVersion) {
				detailParts.push(`NestJS ${highlighter.info(project.nestVersion)}`);
			}
			if (project.orm) {
				detailParts.push(highlighter.info(project.orm));
			}
			scanSpinner.succeed(detailParts.join(" | "));
		}

		const config = await loadConfig(targetPath, args.config);
		const minScore = resolveMinScore(rawMinScore, config.minScore);

		if (args.score) {
			console.log(result.score.value);
			if (!checkMinScore(result.score.value, minScore)) {
				process.exit(1);
			}
			return;
		}

		if (args.json) {
			printJsonReport(result);
			if (!checkMinScore(result.score.value, minScore)) {
				process.exit(1);
			}
			return;
		}

		printConsoleReport(result, args.verbose ?? false);

		if (!checkMinScore(result.score.value, minScore)) {
			logger.error(
				`Score ${result.score.value} is below the minimum threshold of ${minScore}.`
			);
			process.exit(1);
		}

		// Exit with error code if there are errors (for CI)
		if (result.summary.errors > 0) {
			process.exit(1);
		}
	},
});

runMain(main);
