import type { MonorepoScanResult, ScanResult } from "../core/scanner.js";
import type { DiagnoseResult } from "../types/result.js";
import {
	printConsoleReport,
	printMonorepoReport,
} from "./formatters/console-reporter.js";
import { printJsonReport } from "./formatters/json-reporter.js";
import { checkMinScore } from "./min-score.js";
import { logger } from "./ui/logger.js";

interface OutputArgs {
	json: boolean;
	score: boolean;
	verbose: boolean;
}

const enforceMinimumScoreThreshold = (
	diagnoseResult: DiagnoseResult,
	resolvedMinimumScore: number | undefined,
	isMachineReadable: boolean
): void => {
	const score = diagnoseResult.score.value;
	if (!checkMinScore(score, resolvedMinimumScore)) {
		if (!isMachineReadable) {
			logger.error(
				`Score ${score} is below the minimum threshold of ${resolvedMinimumScore}.`
			);
		}
		process.exit(1);
	}
};

const exitOnDiagnosticErrors = (diagnoseResult: DiagnoseResult): void => {
	if (diagnoseResult.summary.errors > 0) {
		process.exit(1);
	}
};

export const outputMonorepoResults = (
	monorepoScanResult: MonorepoScanResult,
	resolvedMinimumScore: number | undefined,
	isMachineReadable: boolean,
	args: OutputArgs
): void => {
	const { result } = monorepoScanResult;

	if (args.score) {
		console.log(result.combined.score.value);
		enforceMinimumScoreThreshold(
			result.combined,
			resolvedMinimumScore,
			isMachineReadable
		);
		return;
	}

	if (args.json) {
		printJsonReport(result.combined);
		enforceMinimumScoreThreshold(
			result.combined,
			resolvedMinimumScore,
			isMachineReadable
		);
		return;
	}

	printMonorepoReport(result, args.verbose);
	enforceMinimumScoreThreshold(
		result.combined,
		resolvedMinimumScore,
		isMachineReadable
	);
	exitOnDiagnosticErrors(result.combined);
};

export const outputSingleProjectResults = (
	singleProjectScanResult: ScanResult,
	resolvedMinimumScore: number | undefined,
	isMachineReadable: boolean,
	args: OutputArgs
): void => {
	const { result } = singleProjectScanResult;

	if (args.score) {
		console.log(result.score.value);
		enforceMinimumScoreThreshold(
			result,
			resolvedMinimumScore,
			isMachineReadable
		);
		return;
	}

	if (args.json) {
		printJsonReport(result);
		enforceMinimumScoreThreshold(
			result,
			resolvedMinimumScore,
			isMachineReadable
		);
		return;
	}

	printConsoleReport(result, args.verbose);
	enforceMinimumScoreThreshold(result, resolvedMinimumScore, isMachineReadable);
	exitOnDiagnosticErrors(result);
};
