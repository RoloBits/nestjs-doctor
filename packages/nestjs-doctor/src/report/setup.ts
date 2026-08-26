import type { SourceInclusion } from "../common/artifact.js";
import { detectMonorepo } from "../engine/project-detector.js";
import { highlighter } from "../ui/highlighter.js";
import { logger } from "../ui/logger.js";
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
	timingsPath: string | undefined,
	outputPath: string | undefined,
	telemetry: boolean | undefined,
	sources: SourceInclusion,
	version: string
): Promise<void> => {
	const monorepo = await detectMonorepo(targetPath);

	const writeAndOpen = async (html: string): Promise<void> => {
		const outPath = await writeReportFile(targetPath, html, outputPath);
		logger.info(`Report written to ${highlighter.info(outPath)}`);
		openReportInBrowser(outPath);
	};

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
			version,
			bootTimings,
			telemetry ?? true,
			sources
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.generateHtml()
			.run();
		logMonorepoSummary(pipeline.monoResult, pipeline.mergedGraph);
		await writeAndOpen(pipeline.generatedHtml);
		return;
	}

	const pipeline = new SingleProjectReportPipeline(
		targetPath,
		configPath,
		version,
		bootTimings,
		telemetry ?? true,
		sources
	);
	await pipeline
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.generateHtml()
		.run();
	logSingleProjectSummary(pipeline.scanResult);
	await writeAndOpen(pipeline.generatedHtml);
};
