/**
 * How much of a scan gets reported: everything, the changed files, the changed
 * lines, or what the change introduced. Every mode analyses the whole project.
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
	/** Files the scope narrowed to, not the change's total file count. */
	changedFiles?: number;
	/** Files the change touched before filtering, when the caller knows it. */
	changedFilesTotal?: number;
	/** Set when the requested mode could not be honoured. */
	degradedFrom?: ScopeMode;
	/** Present in `changed` mode: findings the change resolved. */
	fixed?: number;
	mode: ScopeMode;
}
