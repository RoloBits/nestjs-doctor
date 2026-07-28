import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MAX_DEPENDENCY_NODES } from "../common/endpoint.js";
import type { DiagnoseResult, MonorepoResult } from "../common/result.js";
import type { EngineResult, MonorepoEngineResult } from "../engine/scanner.js";
import { shouldBlock } from "./blocking.js";
import {
	printConsoleReport,
	printMonorepoReport,
} from "./formatters/console-reporter.js";
import { renderResult } from "./formatters/render.js";
import { checkMinScore } from "./min-score.js";
import type { PipelineOptions } from "./setup.js";
import { logger } from "./ui/logger.js";

const FAILURE_EXIT_CODE = 1;

/** Version of the running CLI, set once so reporters can stamp their output. */
let cliVersion = "0.0.0";

export const setCliVersion = (version: string): void => {
	cliVersion = version;
};

const writeRendered = (
	payload: string,
	outputPath: string | undefined
): void => {
	if (!outputPath) {
		console.log(payload);
		return;
	}
	const resolved = resolve(outputPath);
	mkdirSync(dirname(resolved), { recursive: true });
	writeFileSync(resolved, `${payload}\n`, "utf-8");
};

const resolveRunUrl = (): string | undefined => {
	const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
	if (!(GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID)) {
		return;
	}
	return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
};

/** Applies both gates, exiting when either fails. */
function enforceGates(
	result: DiagnoseResult,
	resolvedMinimumScore: number | undefined,
	options: PipelineOptions
): void {
	const score = result.score.value;

	if (!checkMinScore(score, resolvedMinimumScore)) {
		if (!options.isMachineReadable) {
			logger.error(
				`Score ${score} is below the minimum threshold of ${resolvedMinimumScore}.`
			);
		}
		process.exit(FAILURE_EXIT_CODE);
	}

	if (shouldBlock(result.summary, options.blocking)) {
		process.exit(FAILURE_EXIT_CODE);
	}
}

function emit(
	result: DiagnoseResult,
	targetPath: string,
	options: PipelineOptions,
	scopeWarnings: string[],
	monorepo?: MonorepoResult
): void {
	// Always surfaced, on stderr, whatever the format: a silently degraded scope
	// makes a report look cleaner than the code actually is.
	for (const warning of scopeWarnings) {
		logger.warn(warning);
	}

	if (result.project.orm && result.schema?.entities.length === 0) {
		logger.warn(
			`Detected ${result.project.orm} but found no schema to analyse. The schema rules reported nothing because they read nothing.`
		);
	}

	if (result.project.fileCount === 0) {
		logger.warn(
			`No TypeScript files matched under ${targetPath}. The score describes nothing.`
		);
	}

	const truncated =
		result.endpoints?.endpoints.filter((e) => e.truncated).length ?? 0;
	if (truncated > 0) {
		logger.warn(
			`Dependency trace stopped at ${MAX_DEPENDENCY_NODES} nodes for ${truncated} endpoint(s); those traces are incomplete.`
		);
	}

	if (options.score) {
		writeRendered(String(result.score.value), options.outputPath);
		return;
	}

	const payload = renderResult(options.format, result, {
		commitSha: process.env.GITHUB_SHA,
		jsonCompact: options.jsonCompact,
		monorepo,
		runUrl: resolveRunUrl(),
		targetPath,
		version: cliVersion,
		warnings: scopeWarnings,
	});

	if (payload !== null) {
		writeRendered(payload, options.outputPath);
	}

	// `console` and `github` still print the human-readable report; every other
	// format replaces it.
	if (options.format === "console" || options.format === "github") {
		if (monorepo) {
			printMonorepoReport(monorepo, options.verbose);
		} else {
			printConsoleReport(result, options.verbose);
		}
	}
}

export const outputMonorepoResults = (
	monorepoScanResult: MonorepoEngineResult,
	resolvedMinimumScore: number | undefined,
	targetPath: string,
	options: PipelineOptions,
	scopeWarnings: string[] = []
): void => {
	const { result } = monorepoScanResult;
	emit(result.combined, targetPath, options, scopeWarnings, result);
	enforceGates(result.combined, resolvedMinimumScore, options);
};

export const outputSingleProjectResults = (
	singleProjectScanResult: EngineResult,
	resolvedMinimumScore: number | undefined,
	targetPath: string,
	options: PipelineOptions,
	scopeWarnings: string[] = []
): void => {
	const { result } = singleProjectScanResult;
	emit(result, targetPath, options, scopeWarnings);
	enforceGates(result, resolvedMinimumScore, options);
};
