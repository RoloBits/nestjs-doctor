import { spawn } from "node:child_process";
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
	return outPath;
};

const openCommand = (filePath: string): [string, string[]] => {
	if (process.platform === "darwin") {
		return ["open", [filePath]];
	}
	if (process.platform === "win32") {
		return ["cmd", ["/c", "start", "", filePath]];
	}
	return ["xdg-open", [filePath]];
};

export const openReportInBrowser = (filePath: string): void => {
	const [command, args] = openCommand(filePath);
	// Detached with no pipes: an inherited stdio pipe keeps the event loop
	// alive until the browser exits.
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", () => {
		logger.warn(`Could not open ${filePath} in a browser.`);
	});
	child.unref();
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
