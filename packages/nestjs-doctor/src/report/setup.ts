import { highlighter } from "../cli/ui/highlighter.js";
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
import { type BootstrapTimings, loadBootstrapTimings } from "./timings.js";

/** Detect monorepo vs single project and run the appropriate report pipeline */
export const runReport = async (
	targetPath: string,
	configPath: string | undefined,
	timingsPath?: string,
	outputPath?: string,
	telemetry = true
): Promise<void> => {
	const monorepo = await detectMonorepo(targetPath);

	let bootTimings: BootstrapTimings | undefined;
	if (timingsPath) {
		const { timings, warnings } = loadBootstrapTimings(targetPath, timingsPath);
		bootTimings = timings;
		for (const warning of warnings) {
			logger.warn(warning);
		}
	}

	if (monorepo) {
		const pipeline = new MonorepoReportPipeline(
			targetPath,
			configPath,
			monorepo,
			bootTimings,
			telemetry
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.generateHtml()
			.run();
		logMonorepoSummary(pipeline.monoResult, pipeline.mergedGraph);
		const outPath = await writeReportFile(
			targetPath,
			pipeline.generatedHtml,
			outputPath
		);
		logger.info(`Report written to ${highlighter.info(outPath)}`);
		openReportInBrowser(outPath);
		return;
	}

	const pipeline = new SingleProjectReportPipeline(
		targetPath,
		configPath,
		bootTimings,
		telemetry
	);
	await pipeline
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.generateHtml()
		.run();
	logSingleProjectSummary(pipeline.scanResult);
	const outPath = await writeReportFile(
		targetPath,
		pipeline.generatedHtml,
		outputPath
	);
	logger.info(`Report written to ${highlighter.info(outPath)}`);
	openReportInBrowser(outPath);
};
