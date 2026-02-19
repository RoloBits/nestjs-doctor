import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineCommand, runMain } from "citty";
import { detectMonorepo } from "../core/project-detector.js";
import { scan, scanMonorepo } from "../core/scanner.js";
import { flags } from "./flags.js";
import {
	printConsoleReport,
	printMonorepoReport,
} from "./output/console-reporter.js";
import { highlighter } from "./output/highlighter.js";
import { printJsonReport } from "./output/json-reporter.js";
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

			if (args.score) {
				console.log(result.combined.score.value);
				return;
			}

			if (args.json) {
				printJsonReport(result.combined);
				return;
			}

			printMonorepoReport(result, args.verbose ?? false);

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

		if (args.score) {
			console.log(result.score.value);
			return;
		}

		if (args.json) {
			printJsonReport(result);
			return;
		}

		printConsoleReport(result, args.verbose ?? false);

		// Exit with error code if there are errors (for CI)
		if (result.summary.errors > 0) {
			process.exit(1);
		}
	},
});

runMain(main);
