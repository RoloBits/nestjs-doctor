import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** A contiguous run of lines on the new side of a diff hunk. */
export interface LineRange {
	end: number;
	start: number;
}

export interface GitRepo {
	/** Scanned directory relative to {@link root}, posix, `""` at the root. */
	prefix: string;
	/** Absolute path of the repository root, as git reports it. */
	root: string;
	/** Absolute path of the directory being scanned, as the caller gave it. */
	targetPath: string;
}

const BACKSLASH_RE = /\\/g;
const TRAILING_SLASH_RE = /\/$/;
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_BUFFER = 64 * 1024 * 1024;

const toPosix = (value: string): string => value.replace(BACKSLASH_RE, "/");

/** Variables that pin git to a repository; cleared so `cwd` decides. */
const REPO_SCOPING_GIT_VARS = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
	"GIT_NAMESPACE",
	"GIT_PREFIX",
	"GIT_CEILING_DIRECTORIES",
];

function gitEnvironment(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const name of REPO_SCOPING_GIT_VARS) {
		delete env[name];
	}
	return env;
}

/** Last git failure, kept so callers can explain a degraded scope. */
let lastGitError = "";

/** stderr of the most recent failed git command, or `""` if none has failed. */
export const getLastGitError = (): string => lastGitError;

/** Runs a git command, returning stdout or `null` on any failure. */
export function runGit(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf-8",
			env: gitEnvironment(),
			stdio: ["ignore", "pipe", "pipe"],
			timeout: GIT_TIMEOUT_MS,
			maxBuffer: MAX_GIT_BUFFER,
		});
	} catch (error) {
		const stderr = (error as { stderr?: Buffer | string }).stderr;
		lastGitError = String(stderr ?? "").trim();
		return null;
	}
}

/** Resolves the repository that contains `targetPath`, or `null` if there is none. */
export function findGitRepo(targetPath: string): GitRepo | null {
	const root = runGit(targetPath, ["rev-parse", "--show-toplevel"]);
	if (!root) {
		return null;
	}
	const prefix = runGit(targetPath, ["rev-parse", "--show-prefix"]);
	if (prefix === null) {
		return null;
	}
	return {
		prefix: toPosix(prefix.trim()).replace(TRAILING_SLASH_RE, ""),
		root: resolve(root.trim()),
		targetPath: resolve(targetPath),
	};
}

/** True when `ref` names a commit that is present in the local object store. */
export function refExists(repo: GitRepo, ref: string): boolean {
	return (
		runGit(repo.root, [
			"rev-parse",
			"--verify",
			"--quiet",
			`${ref}^{commit}`,
		]) !== null
	);
}

const CANDIDATE_BASE_REFS = [
	"origin/main",
	"origin/master",
	"origin/develop",
	"main",
	"master",
	"develop",
];

/**
 * Picks the ref to compare against: explicit, then `GITHUB_BASE_REF`, then the
 * remote's default branch, then conventional names. `null` if none resolve.
 */
export function resolveBaseRef(
	repo: GitRepo,
	explicit?: string
): string | null {
	if (explicit) {
		return refExists(repo, explicit) ? explicit : null;
	}

	const envBase = process.env.GITHUB_BASE_REF?.trim();
	if (envBase) {
		for (const candidate of [`origin/${envBase}`, envBase]) {
			if (refExists(repo, candidate)) {
				return candidate;
			}
		}
	}

	const headRef = runGit(repo.root, [
		"symbolic-ref",
		"--quiet",
		"--short",
		"refs/remotes/origin/HEAD",
	]);
	if (headRef && refExists(repo, headRef.trim())) {
		return headRef.trim();
	}

	for (const candidate of CANDIDATE_BASE_REFS) {
		if (refExists(repo, candidate)) {
			return candidate;
		}
	}

	return null;
}

/**
 * Maps a repository-relative path into the scanned directory's path space,
 * or `null` when it falls outside. Built from `targetPath`, not `root`.
 */
function toTargetPath(repo: GitRepo, repoRelativePath: string): string | null {
	const normalized = toPosix(repoRelativePath.trim());
	if (!normalized) {
		return null;
	}

	if (!repo.prefix) {
		return toPosix(join(repo.targetPath, normalized));
	}

	const withinPrefix = `${repo.prefix}/`;
	if (!normalized.startsWith(withinPrefix)) {
		return null;
	}
	return toPosix(join(repo.targetPath, normalized.slice(withinPrefix.length)));
}

/** Absolute paths for the entries inside the scanned directory. */
function toAbsoluteWithinTarget(repo: GitRepo, paths: string[]): string[] {
	const within: string[] = [];

	for (const relativePath of paths) {
		const absolute = toTargetPath(repo, relativePath);
		if (absolute) {
			within.push(absolute);
		}
	}

	return within.sort();
}

/** Files added, modified, or renamed between the merge base of `base` and HEAD. */
export function getChangedFiles(repo: GitRepo, base: string): string[] | null {
	const output = runGit(repo.root, [
		"diff",
		"--name-only",
		"--diff-filter=AMR",
		`${base}...HEAD`,
	]);
	if (output === null) {
		return null;
	}
	return toAbsoluteWithinTarget(repo, output.split("\n"));
}

/** Files staged in the index — the set a pre-commit hook should look at. */
export function getStagedFiles(repo: GitRepo): string[] | null {
	const output = runGit(repo.root, [
		"diff",
		"--name-only",
		"--diff-filter=AMR",
		"--cached",
	]);
	if (output === null) {
		return null;
	}
	return toAbsoluteWithinTarget(repo, output.split("\n"));
}

/** Parses `--unified=0` diff output into new-side line ranges per file. */
export function parseDiffLineRanges(
	repo: GitRepo,
	diff: string
): Map<string, LineRange[]> {
	const ranges = new Map<string, LineRange[]>();
	let current: LineRange[] | null = null;

	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ ")) {
			const path = line.slice(4).trim();
			if (path === "/dev/null") {
				current = null;
				continue;
			}
			const relativePath = path.startsWith("b/") ? path.slice(2) : path;
			const absolute = toTargetPath(repo, relativePath);
			if (!absolute) {
				current = null;
				continue;
			}
			current = ranges.get(absolute) ?? [];
			ranges.set(absolute, current);
			continue;
		}

		if (!current) {
			continue;
		}

		const hunk = HUNK_HEADER_RE.exec(line);
		if (!hunk) {
			continue;
		}

		const start = Number(hunk[1]);
		const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
		if (count === 0) {
			// A pure deletion touches no new-side line.
			continue;
		}
		current.push({ start, end: start + count - 1 });
	}

	return ranges;
}

/** New-side line ranges introduced between the merge base of `base` and HEAD. */
export function getChangedLineRanges(
	repo: GitRepo,
	base: string
): Map<string, LineRange[]> | null {
	const output = runGit(repo.root, [
		"diff",
		"--unified=0",
		"--diff-filter=AMR",
		`${base}...HEAD`,
	]);
	if (output === null) {
		return null;
	}
	return parseDiffLineRanges(repo, output);
}

/** New-side line ranges for the staged changes. */
export function getStagedLineRanges(
	repo: GitRepo
): Map<string, LineRange[]> | null {
	const output = runGit(repo.root, [
		"diff",
		"--unified=0",
		"--diff-filter=AMR",
		"--cached",
	]);
	if (output === null) {
		return null;
	}
	return parseDiffLineRanges(repo, output);
}

export interface BaseCheckout {
	/** Removes the temporary worktree. Safe to call more than once. */
	cleanup(): void;
	/** Absolute path mirroring the scanned directory at the base revision. */
	targetPath: string;
}

/**
 * Checks the base revision out into a detached worktree under the OS temp
 * directory. `null` when the base is unreachable.
 */
export function checkoutBase(repo: GitRepo, base: string): BaseCheckout | null {
	const mergeBase = runGit(repo.root, ["merge-base", base, "HEAD"]);
	const revision = mergeBase?.trim() || base;

	let worktreePath: string;
	try {
		worktreePath = mkdtempSync(join(tmpdir(), "nestjs-doctor-base-"));
	} catch {
		return null;
	}

	const added = runGit(repo.root, [
		"worktree",
		"add",
		"--detach",
		"--no-checkout",
		worktreePath,
		revision,
	]);
	if (added === null) {
		rmSync(worktreePath, { recursive: true, force: true });
		return null;
	}

	let removed = false;
	const cleanup = (): void => {
		if (removed) {
			return;
		}
		removed = true;
		runGit(repo.root, ["worktree", "remove", "--force", worktreePath]);
		rmSync(worktreePath, { recursive: true, force: true });
		runGit(repo.root, ["worktree", "prune"]);
	};

	if (runGit(worktreePath, ["checkout", "--force", revision]) === null) {
		cleanup();
		return null;
	}

	const targetPath = repo.prefix
		? join(worktreePath, repo.prefix)
		: worktreePath;

	return { targetPath, cleanup };
}

/** Resolves a user-supplied path against `cwd` unless it is already absolute. */
export function resolveAgainst(cwd: string, path: string): string {
	return isAbsolute(path) ? path : resolve(cwd, path);
}
