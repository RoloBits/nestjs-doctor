import { exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { highlighter } from "../cli/ui/highlighter.js";
import { logger } from "../cli/ui/logger.js";
import { mergeModuleGraphs } from "../engine/module-graph.js";
import type { MonorepoScanResult, ScanResult } from "../engine/scanner.js";

export const writeReportFile = async (
	targetPath: string,
	html: string
): Promise<string> => {
	const outPath = join(targetPath, "nestjs-doctor-report.html");
	await writeFile(outPath, html, "utf-8");
	logger.info(`Report written to ${highlighter.info(outPath)}`);
	return outPath;
};

export const openReportInBrowser = (filePath: string): void => {
	if (process.platform === "darwin") {
		exec(`open "${filePath}"`);
		return;
	}
	if (process.platform === "win32") {
		exec(`start "${filePath}"`);
		return;
	}
	exec(`xdg-open "${filePath}"`);
};

export const logSingleProjectSummary = (scanResult: ScanResult): void => {
	const { moduleGraph } = scanResult;
	logger.info(
		`Found ${highlighter.info(String(moduleGraph.modules.size))} modules, ${highlighter.info(String(moduleGraph.edges.size))} edges`
	);
};

export const logMonorepoSummary = (monoResult: MonorepoScanResult): void => {
	const { moduleGraphs } = monoResult;
	const merged = mergeModuleGraphs(moduleGraphs);
	logger.info(
		`Found ${highlighter.info(String(merged.modules.size))} modules across ${highlighter.info(String(moduleGraphs.size))} projects`
	);
};
