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
 * Gate level for a run. Defaults per mode: `error` for the console report,
 * `none` for machine-readable output.
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
