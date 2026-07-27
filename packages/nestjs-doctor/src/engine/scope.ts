import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Diagnostic } from "../common/diagnostic.js";
import { isCodeDiagnostic } from "../common/diagnostic.js";
import type { ScopeInfo, ScopeMode } from "../common/scope.js";
import {
	findGitRepo,
	type GitRepo,
	getChangedFiles,
	getChangedLineRanges,
	getStagedFiles,
	getStagedLineRanges,
	type LineRange,
	resolveAgainst,
	resolveBaseRef,
} from "./git.js";

export interface ScopeOptions {
	/** Git ref to compare against. Auto-detected when omitted. */
	base?: string;
	/** Path to a newline-separated list of changed files (CI hand-off). */
	changedFilesFrom?: string;
	mode: ScopeMode;
	/** Compare against the index instead of a ref. */
	staged?: boolean;
	targetPath: string;
}

export interface ResolvedScope {
	baseRef: string | null;
	/** Absolute paths of the changed files, or `null` in `full` mode. */
	files: Set<string> | null;
	lineRanges: Map<string, LineRange[]> | null;
	/** The mode actually in force — may be a degraded `requestedMode`. */
	mode: ScopeMode;
	repo: GitRepo | null;
	requestedMode: ScopeMode;
	warnings: string[];
}

const BACKSLASH_RE = /\\/g;
const toPosix = (value: string): string => value.replace(BACKSLASH_RE, "/");

function readChangedFilesList(
	targetPath: string,
	listPath: string
): string[] | null {
	try {
		const raw = readFileSync(resolveAgainst(targetPath, listPath), "utf-8");
		return raw
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => toPosix(resolve(targetPath, line)));
	} catch {
		return null;
	}
}

const fullScope = (
	repo: GitRepo | null,
	requestedMode: ScopeMode,
	warnings: string[],
	degraded: boolean
): ResolvedScope => ({
	baseRef: null,
	files: null,
	lineRanges: null,
	mode: degraded ? "full" : requestedMode,
	repo,
	requestedMode,
	warnings,
});

/**
 * Works out which files, and lines, the reported set narrows to. Every failure
 * path degrades to a wider scope with a warning.
 */
export function resolveScope(options: ScopeOptions): ResolvedScope {
	const { mode, targetPath } = options;
	const warnings: string[] = [];

	if (mode === "full") {
		return fullScope(null, "full", warnings, false);
	}

	const repo = findGitRepo(targetPath);
	if (!repo) {
		warnings.push(
			`--scope ${mode} needs a git repository; ${targetPath} is not inside one. Reporting every finding instead.`
		);
		return fullScope(null, mode, warnings, true);
	}

	if (options.staged) {
		const files = getStagedFiles(repo);
		if (!files) {
			warnings.push(
				"--staged could not read the git index. Reporting every finding instead."
			);
			return fullScope(repo, mode, warnings, true);
		}
		return {
			baseRef: null,
			files: new Set(files),
			lineRanges: mode === "lines" ? getStagedLineRanges(repo) : null,
			mode,
			repo,
			requestedMode: mode,
			warnings,
		};
	}

	const listed = options.changedFilesFrom
		? readChangedFilesList(targetPath, options.changedFilesFrom)
		: null;
	if (options.changedFilesFrom && !listed) {
		warnings.push(
			`Could not read the changed-file list at ${options.changedFilesFrom}. Falling back to git.`
		);
	}

	const baseRef = resolveBaseRef(repo, options.base);
	if (!baseRef) {
		if (listed) {
			// An explicit file list still narrows `files` without git. Line accuracy
			// and the baseline delta both need the base commit, so those degrade.
			if (mode !== "files") {
				warnings.push(
					`--scope ${mode} needs the base commit, which is not in this checkout (a shallow clone, typically — fetch it with \`fetch-depth: 0\`). Reporting every finding in the changed files instead.`
				);
			}
			return {
				baseRef: null,
				files: new Set(listed),
				lineRanges: null,
				mode: "files",
				repo,
				requestedMode: mode,
				warnings,
			};
		}
		warnings.push(
			options.base
				? `Base ref "${options.base}" is not in this checkout. Reporting every finding instead.`
				: "Could not work out a base ref to compare against. Reporting every finding instead."
		);
		return fullScope(repo, mode, warnings, true);
	}

	const changed = listed ?? getChangedFiles(repo, baseRef);
	if (!changed) {
		warnings.push(
			`Could not diff against "${baseRef}". Reporting every finding instead.`
		);
		return fullScope(repo, mode, warnings, true);
	}

	return {
		baseRef,
		files: new Set(changed),
		lineRanges: mode === "lines" ? getChangedLineRanges(repo, baseRef) : null,
		mode,
		repo,
		requestedMode: mode,
		warnings,
	};
}

const isWithinRanges = (ranges: LineRange[], line: number): boolean =>
	ranges.some((range) => line >= range.start && line <= range.end);

/** Narrows a diagnostic set to the resolved scope. `changed` is applied by the caller. */
export function applyScope(
	diagnostics: Diagnostic[],
	scope: ResolvedScope
): Diagnostic[] {
	if (scope.mode === "full" || !scope.files) {
		return diagnostics;
	}

	const files = scope.files;
	const inChangedFile = (diagnostic: Diagnostic): boolean =>
		files.has(toPosix(diagnostic.filePath));

	if (scope.mode === "lines") {
		const ranges = scope.lineRanges;
		if (!ranges) {
			return diagnostics.filter(inChangedFile);
		}
		return diagnostics.filter((diagnostic) => {
			if (!isCodeDiagnostic(diagnostic)) {
				// Schema findings carry no line, so nothing can place them inside a hunk.
				return false;
			}
			const fileRanges = ranges.get(toPosix(diagnostic.filePath));
			return fileRanges ? isWithinRanges(fileRanges, diagnostic.line) : false;
		});
	}

	return diagnostics.filter(inChangedFile);
}

/** Builds the {@link ScopeInfo} recorded on a result. */
export function buildScopeInfo(
	scope: ResolvedScope,
	extra: { baselineAvailable?: boolean; fixed?: number } = {}
): ScopeInfo | undefined {
	if (scope.mode === "full" && scope.requestedMode === "full") {
		return;
	}

	const info: ScopeInfo = { mode: scope.mode };
	if (scope.mode !== scope.requestedMode) {
		info.degradedFrom = scope.requestedMode;
	}
	if (scope.baseRef) {
		info.baseRef = scope.baseRef;
	}
	if (scope.files) {
		info.changedFiles = scope.files.size;
	}
	if (extra.baselineAvailable !== undefined) {
		info.baselineAvailable = extra.baselineAvailable;
	}
	if (extra.fixed !== undefined) {
		info.fixed = extra.fixed;
	}
	return info;
}
