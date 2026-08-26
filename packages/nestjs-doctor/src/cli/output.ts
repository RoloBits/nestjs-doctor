import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ReportArtifact } from "../common/artifact.js";
import { MAX_DEPENDENCY_NODES } from "../common/endpoint.js";
import type { DiagnoseResult, MonorepoResult } from "../common/result.js";
import type { EngineResult, MonorepoEngineResult } from "../engine/scanner.js";
import { highlighter } from "../ui/highlighter.js";
import { logger } from "../ui/logger.js";
import { shouldBlock } from "./blocking.js";
import {
	printConsoleReport,
	printMonorepoReport,
} from "./formatters/console-reporter.js";
import { renderResult, stringifyJson } from "./formatters/render.js";
import { checkMinScore } from "./min-score.js";
import type { PipelineOptions } from "./setup.js";

const FAILURE_EXIT_CODE = 1;

/** Version of the running CLI, set once so reporters can stamp their output. */
let cliVersion = "0.0.0";

export const setCliVersion = (version: string): void => {
	cliVersion = version;
};

export const getCliVersion = (): string => cliVersion;

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

/** Applies both gates, marking the process failed when either trips. */
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
		process.exitCode = FAILURE_EXIT_CODE;
		return;
	}

	if (shouldBlock(result.diagnostics, options.blocking)) {
		process.exitCode = FAILURE_EXIT_CODE;
	}
}

function emit(
	result: DiagnoseResult,
	targetPath: string,
	options: PipelineOptions,
	scopeWarnings: string[],
	monorepo?: MonorepoResult,
	artifact?: () => ReportArtifact
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

	if (options.format === "report-json") {
		const built = artifact?.();
		if (!built) {
			logger.warn(
				"--format report-json ran without an artifact; nothing was written."
			);
			return;
		}
		const outPath = resolve(
			options.outputPath ?? join(targetPath, "nestjs-doctor-report.json")
		);
		writeRendered(stringifyJson(built, options.jsonCompact), outPath);
		logger.info(`Report written to ${highlighter.info(outPath)}`);
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
	// An interactive run hands presentation to the TUI; --verbose still dumps.
	const interactiveTakesOver = options.interactive && !options.verbose;
	if (
		!interactiveTakesOver &&
		(options.format === "console" || options.format === "github")
	) {
		if (monorepo) {
			printMonorepoReport(monorepo, options.verbose, false);
		} else {
			printConsoleReport(result, options.verbose, false);
		}
	}
}

export const outputMonorepoResults = (
	monorepoScanResult: MonorepoEngineResult,
	resolvedMinimumScore: number | undefined,
	targetPath: string,
	options: PipelineOptions,
	scopeWarnings: string[] = [],
	artifact?: () => ReportArtifact
): void => {
	const { result } = monorepoScanResult;
	emit(result.combined, targetPath, options, scopeWarnings, result, artifact);
	enforceGates(result.combined, resolvedMinimumScore, options);
};

export const outputSingleProjectResults = (
	singleProjectScanResult: EngineResult,
	resolvedMinimumScore: number | undefined,
	targetPath: string,
	options: PipelineOptions,
	scopeWarnings: string[] = [],
	artifact?: () => ReportArtifact
): void => {
	const { result } = singleProjectScanResult;
	emit(result, targetPath, options, scopeWarnings, undefined, artifact);
	enforceGates(result, resolvedMinimumScore, options);
};
