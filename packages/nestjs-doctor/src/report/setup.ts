import { logger } from "../cli/ui/logger.js";
import { detectMonorepo } from "../engine/project-detector.js";
import {
	logMonorepoSummary,
	logSingleProjectSummary,
	openReportInBrowser,
	writeReportFile,
} from "./output.js";
import {
	MonorepoReportPipeline,
	SingleProjectReportPipeline,
} from "./pipeline.js";
import { type ClassTiming, loadBootstrapTimings } from "./timings.js";

/** Detect monorepo vs single project and run the appropriate report pipeline */
export const runReport = async (
	targetPath: string,
	configPath: string | undefined,
	timingsPath?: string
): Promise<void> => {
	const monorepo = await detectMonorepo(targetPath);

	let timingsByModule: Map<string, ClassTiming[]> | undefined;
	if (timingsPath) {
		const { timings, warnings } = loadBootstrapTimings(targetPath, timingsPath);
		timingsByModule = timings;
		for (const warning of warnings) {
			logger.warn(warning);
		}
	}

	if (monorepo) {
		const pipeline = new MonorepoReportPipeline(
			targetPath,
			configPath,
			monorepo,
			timingsByModule
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.generateHtml()
			.run();
		logMonorepoSummary(pipeline.monoResult, pipeline.mergedGraph);
		const outPath = await writeReportFile(targetPath, pipeline.generatedHtml);
		openReportInBrowser(outPath);
		return;
	}

	const pipeline = new SingleProjectReportPipeline(
		targetPath,
		configPath,
		timingsByModule
	);
	await pipeline
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.generateHtml()
		.run();
	logSingleProjectSummary(pipeline.scanResult);
	const outPath = await writeReportFile(targetPath, pipeline.generatedHtml);
	openReportInBrowser(outPath);
};
