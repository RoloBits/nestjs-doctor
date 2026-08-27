/** How much of a scan gets reported. */
export type ScopeMode = "full" | "files" | "lines" | "changed";

export interface ScopeInfo {
	baselineAvailable?: boolean;
	baseRef?: string;
	changedFiles?: number;
	changedFilesTotal?: number;
	degradedFrom?: ScopeMode;
	fixed?: number;
	mode: ScopeMode;
}
