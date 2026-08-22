import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { highlighter } from "../cli/ui/highlighter.js";
import { logger } from "../cli/ui/logger.js";
import {
	type ModuleGraph,
	mergeModuleGraphs,
} from "../engine/graph/module-graph.js";
import type { EngineResult, MonorepoEngineResult } from "../engine/scanner.js";

/**
 * Writes the report to `outputPath` when given, resolved against the working
 * directory, otherwise beside the scanned project.
 */
export const writeReportFile = async (
	targetPath: string,
	html: string,
	outputPath?: string
): Promise<string> => {
	const outPath = outputPath
		? resolve(outputPath)
		: join(targetPath, "nestjs-doctor-report.html");
	await mkdir(dirname(outPath), { recursive: true });
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

export const logSingleProjectSummary = (scanResult: EngineResult): void => {
	const { moduleGraph } = scanResult;
	logger.info(
		`Found ${highlighter.info(String(moduleGraph.modules.size))} modules, ${highlighter.info(String(moduleGraph.edges.size))} edges`
	);
};

export const logMonorepoSummary = (
	monoResult: MonorepoEngineResult,
	precomputedMerge?: ModuleGraph
): void => {
	const { moduleGraphs } = monoResult;
	const merged = precomputedMerge ?? mergeModuleGraphs(moduleGraphs);
	logger.info(
		`Found ${highlighter.info(String(merged.modules.size))} modules across ${highlighter.info(String(moduleGraphs.size))} projects`
	);
};
