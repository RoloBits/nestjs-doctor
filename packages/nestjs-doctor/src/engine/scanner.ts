import { performance } from "node:perf_hooks";
import {
	buildAnalysisContext,
	buildMonorepoContext,
} from "./analysis-context.js";
import { resolveScanConfig, type ScanConfig } from "./config/scan-config.js";
import { diagnose, type RawDiagnosticOutput } from "./diagnostician.js";
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
	buildMonorepoContext,
	type MonorepoContext,
	prepareAnalysis,
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
} from "./result-builder.js";

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
	const ctx = await buildMonorepoContext(targetPath, scanConfig, monorepo);
	const rawOutputs = new Map<string, RawDiagnosticOutput>();
	for (const [name, context] of ctx.subProjects) {
		rawOutputs.set(name, diagnose(context));
	}
	const totalElapsedMs = performance.now() - startTime;
	return buildMonorepoResult(
		ctx,
		rawOutputs,
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
