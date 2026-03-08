import { exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { autoScan } from "../../core/scanner.js";
import { mergeModuleGraphs } from "../../engine/module-graph.js";
import { highlighter } from "../ui/highlighter.js";
import { logger } from "../ui/logger.js";
import { spinner } from "../ui/spinner.js";
import { generateReport } from "./generator.js";

/** Self-contained report generation: scan, build HTML, write file, open browser */
export const runReportFlow = async (
	targetPath: string,
	configPath: string | undefined
): Promise<void> => {
	const reportSpinner = spinner("Generating report...").start();

	const autoResult = await autoScan(targetPath, { config: configPath });

	let html: string;
	if (autoResult.isMonorepo) {
		const { result: monorepoResult, moduleGraphs } = autoResult.monorepo;
		const merged = mergeModuleGraphs(moduleGraphs);
		const projects = [...moduleGraphs.keys()];
		reportSpinner.succeed(
			`Found ${highlighter.info(String(merged.modules.size))} modules across ${highlighter.info(String(moduleGraphs.size))} projects`
		);
		html = generateReport(merged, monorepoResult.combined, { projects });
	} else {
		const { result, moduleGraph, files, providers } = autoResult.single;
		reportSpinner.succeed(
			`Found ${highlighter.info(String(moduleGraph.modules.size))} modules, ${highlighter.info(String(moduleGraph.edges.size))} edges`
		);
		html = generateReport(moduleGraph, result, { files, providers });
	}

	const outPath = join(targetPath, "nestjs-doctor-report.html");
	await writeFile(outPath, html, "utf-8");
	logger.info(`Report written to ${highlighter.info(outPath)}`);

	if (process.platform === "darwin") {
		exec(`open "${outPath}"`);
		return;
	}

	if (process.platform === "win32") {
		exec(`start "${outPath}"`);
		return;
	}

	exec(`xdg-open "${outPath}"`);
};
