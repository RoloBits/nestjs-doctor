import { exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { defineCommand, runMain } from "citty";
import { loadConfig } from "../core/config-loader.js";
import { detectMonorepo } from "../core/project-detector.js";
import { scan, scanMonorepo } from "../core/scanner.js";
import { mergeModuleGraphs } from "../engine/module-graph.js";
import { flags } from "./flags.js";
import { initSkill } from "./init-skill.js";
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
import { generateReport } from "./output/report-generator.js";
import { spinner } from "./output/spinner.js";

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
		const targetPath = resolve(args.path ?? ".");

		if (args.init) {
			await initSkill(targetPath);
			return;
		}

		if (args.report) {
			const monorepo = await detectMonorepo(targetPath);

			let html: string;
			if (monorepo) {
				const reportSpinner = spinner("Generating report...").start();
				const { result: monorepoResult, moduleGraphs } = await scanMonorepo(
					targetPath,
					{ config: args.config }
				);
				const merged = mergeModuleGraphs(moduleGraphs);
				const projects = [...moduleGraphs.keys()];
				reportSpinner.succeed(
					`Found ${highlighter.info(String(merged.modules.size))} modules across ${highlighter.info(String(moduleGraphs.size))} projects`
				);
				html = generateReport(merged, monorepoResult.combined, { projects });
			} else {
				const reportSpinner = spinner("Generating report...").start();
				const { result, moduleGraph, files, providers } = await scan(
					targetPath,
					{
						config: args.config,
					}
				);
				reportSpinner.succeed(
					`Found ${highlighter.info(String(moduleGraph.modules.size))} modules, ${highlighter.info(String(moduleGraph.edges.size))} edges`
				);
				html = generateReport(moduleGraph, result, {
					files,
					providers,
				});
			}

			const outPath = join(targetPath, "nestjs-doctor-report.html");
			await writeFile(outPath, html, "utf-8");
			logger.info(`Report written to ${highlighter.info(outPath)}`);

			let openCmd = "xdg-open";
			if (process.platform === "darwin") {
				openCmd = "open";
			} else if (process.platform === "win32") {
				openCmd = "start";
			}
			exec(`${openCmd} "${outPath}"`);
			return;
		}

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

			const { result, customRuleWarnings } = await scanMonorepo(targetPath, {
				config: args.config,
			});

			if (scanSpinner) {
				const projectNames = result.subProjects.map((sp) => sp.name).join(", ");
				scanSpinner.succeed(
					`Scanned ${highlighter.info(String(result.combined.project.fileCount))} files across ${highlighter.info(String(result.subProjects.length))} projects (${projectNames})`
				);
			}

			if (!isSilent) {
				for (const warning of customRuleWarnings) {
					logger.warn(warning);
				}
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

		const { result, customRuleWarnings } = await scan(targetPath, {
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

		if (!isSilent) {
			for (const warning of customRuleWarnings) {
				logger.warn(warning);
			}
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
