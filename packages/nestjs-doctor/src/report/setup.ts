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

/** Detect monorepo vs single project and run the appropriate report pipeline */
export const runReport = async (
	targetPath: string,
	configPath: string | undefined
): Promise<void> => {
	const monorepo = await detectMonorepo(targetPath);

	if (monorepo) {
		const pipeline = new MonorepoReportPipeline(
			targetPath,
			configPath,
			monorepo
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.generateHtml()
			.run();
		logMonorepoSummary(pipeline.monoResult);
		const outPath = await writeReportFile(targetPath, pipeline.generatedHtml);
		openReportInBrowser(outPath);
		return;
	}

	const pipeline = new SingleProjectReportPipeline(targetPath, configPath);
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
