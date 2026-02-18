import { resolve } from "node:path";
import { defineCommand, runMain } from "citty";
import { scan } from "../core/scanner.js";
import { flags } from "./flags.js";
import { printConsoleReport } from "./output/console-reporter.js";
import { highlighter } from "./output/highlighter.js";
import { printJsonReport } from "./output/json-reporter.js";
import { spinner } from "./output/spinner.js";

const main = defineCommand({
	meta: {
		name: "nestjs-doctor",
		version: "0.1.0",
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
