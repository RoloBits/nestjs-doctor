import type { DiagnoseSummary } from "../common/result.js";

/** Severity at or above which findings fail the run. */
export type BlockingLevel = "none" | "warning" | "error";

export const BLOCKING_LEVELS: BlockingLevel[] = ["none", "warning", "error"];

export function isBlockingLevel(value: string): value is BlockingLevel {
	return (BLOCKING_LEVELS as string[]).includes(value);
}

export const validateBlockingArg = (raw: string): string | null =>
	isBlockingLevel(raw)
		? null
		: `Invalid --blocking value: "${raw}". Must be one of ${BLOCKING_LEVELS.join(", ")}.`;

/**
 * Picks the gate level for a run.
 *
 * The defaults reproduce the behaviour that shipped before `--blocking`
 * existed: the console report fails on error diagnostics, while `--json` and
 * `--score` only ever fail on `--min-score`. That split is not a design worth
 * defending — it is a compatibility promise, and passing `--blocking`
 * explicitly makes both paths behave identically.
 */
export function resolveBlocking(
	explicit: string | undefined,
	isMachineReadable: boolean
): BlockingLevel {
	if (explicit && isBlockingLevel(explicit)) {
		return explicit;
	}
	return isMachineReadable ? "none" : "error";
}

/** True when the findings in `summary` should fail the run at `level`. */
export function shouldBlock(
	summary: DiagnoseSummary,
	level: BlockingLevel
): boolean {
	if (level === "none") {
		return false;
	}
	if (level === "warning") {
		return summary.errors + summary.warnings > 0;
	}
	return summary.errors > 0;
}
