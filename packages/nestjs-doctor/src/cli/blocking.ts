import { type Diagnostic, onSurface } from "../common/diagnostic.js";

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

/** True when the findings in `diagnostics` should fail the run at `level`. */
export function shouldBlock(
	diagnostics: Diagnostic[],
	level: BlockingLevel
): boolean {
	if (level === "none") {
		return false;
	}
	const gating = diagnostics.filter((d) => onSurface(d, "ciFailure"));
	if (level === "warning") {
		return gating.some(
			(d) => d.severity === "error" || d.severity === "warning"
		);
	}
	return gating.some((d) => d.severity === "error");
}
