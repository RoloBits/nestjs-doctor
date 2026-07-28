import { performance } from "node:perf_hooks";
import { buildAnalysisContext, reduceSubProjects } from "./analysis-context.js";
import { resolveScanConfig, type ScanConfig } from "./config/scan-config.js";
import { diagnose } from "./diagnostician.js";
import { detectMonorepo, type MonorepoInfo } from "./project-detector.js";
import {
	buildMonorepoResult,
	buildResult,
	type EngineResult,
	type MonorepoEngineResult,
} from "./result-builder.js";

// biome-ignore lint/performance/noBarrelFile: re-exports preserve backward compatibility for all consumers
export {
	type AnalysisContext,
	buildAnalysisContext,
	prepareAnalysis,
	reduceSubProjects,
	updateFile,
} from "./analysis-context.js";

export {
	resolveScanConfig,
	type ScanConfig,
} from "./config/scan-config.js";
export {
	checkAllFiles,
	checkFile,
	checkProject,
	checkSchema,
	diagnose,
	type RawDiagnosticOutput,
} from "./diagnostician.js";
export {
	buildMonorepoResult,
	buildResult,
	type EngineResult,
	type MonorepoEngineResult,
	withScopedDiagnostics,
} from "./result-builder.js";

import { detachModuleGraph } from "./graph/module-graph.js";

// Facades that compose both
export type AutoScanResult =
	| { isMonorepo: true; monorepo: MonorepoEngineResult }
	| { isMonorepo: false; single: EngineResult };

export async function scanMonorepo(
	targetPath: string,
	scanConfig: ScanConfig,
	monorepo: MonorepoInfo
): Promise<MonorepoEngineResult> {
	const startTime = performance.now();
	const scanResults = await reduceSubProjects(
		targetPath,
		scanConfig,
		monorepo,
		(_name, context) => {
			const scanResult = buildResult(context, diagnose(context));
			return {
				...scanResult,
				moduleGraph: detachModuleGraph(scanResult.moduleGraph),
				providers: new Map(),
			};
		}
	);
	const totalElapsedMs = performance.now() - startTime;
	return buildMonorepoResult(
		scanResults,
		scanConfig.customRuleWarnings,
		totalElapsedMs
	);
}

export async function autoScan(
	targetPath: string,
	options: { config?: string; monorepo?: MonorepoInfo } = {}
): Promise<AutoScanResult> {
	const scanConfig = await resolveScanConfig(targetPath, options.config);
	const detected = await detectMonorepo(targetPath);
	if (detected) {
		const result = await scanMonorepo(targetPath, scanConfig, detected);
		return { isMonorepo: true, monorepo: result };
	}
	const context = await buildAnalysisContext(targetPath, scanConfig);
	const rawOutput = diagnose(context);
	const result = buildResult(context, rawOutput, scanConfig.customRuleWarnings);
	return { isMonorepo: false, single: result };
}
