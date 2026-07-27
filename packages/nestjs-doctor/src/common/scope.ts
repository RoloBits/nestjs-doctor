/**
 * How much of a scan gets reported.
 *
 * - `full` — every finding in the project (the default).
 * - `files` — findings in files the change touched.
 * - `lines` — findings on the lines the change touched.
 * - `changed` — findings the change introduced, measured against a base revision.
 *
 * Every mode analyses the whole project: narrowing happens on the reported set,
 * never on the input, so cross-file rules (module cycles, unused providers,
 * unused exports) still see everything.
 */
export type ScopeMode = "full" | "files" | "lines" | "changed";

export const SCOPE_MODES: ScopeMode[] = ["full", "files", "lines", "changed"];

export function isScopeMode(value: string): value is ScopeMode {
	return (SCOPE_MODES as string[]).includes(value);
}

/** Scope metadata attached to a result so consumers can see what was reported. */
export interface ScopeInfo {
	/** Present in `changed` mode: whether the base revision could be scanned. */
	baselineAvailable?: boolean;
	baseRef?: string;
	changedFiles?: number;
	/** Set when the requested mode could not be honoured. */
	degradedFrom?: ScopeMode;
	/** Present in `changed` mode: findings the change resolved. */
	fixed?: number;
	mode: ScopeMode;
}
