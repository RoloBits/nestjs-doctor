import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	type ModuleGraph,
	mergeModuleGraphs,
} from "../engine/graph/module-graph.js";
import type { EngineResult, MonorepoEngineResult } from "../engine/scanner.js";
import { highlighter } from "../ui/highlighter.js";
import { logger } from "../ui/logger.js";

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

/** The platform's file opener, as a command and its arguments. */
export const openCommand = (filePath: string): [string, string[]] => {
	if (process.platform === "darwin") {
		return ["open", [filePath]];
	}
	if (process.platform === "win32") {
		return ["cmd", ["/c", "start", "", filePath]];
	}
	return ["xdg-open", [filePath]];
};

export const openReportInBrowser = (
	filePath: string,
	onError: (message: string) => void = logger.warn
): void => {
	const [command, args] = openCommand(filePath);
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", () => {
		onError(`Could not open ${filePath} in a browser.`);
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
