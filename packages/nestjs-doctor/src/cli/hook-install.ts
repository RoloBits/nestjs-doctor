import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { findGitRepo } from "../engine/git.js";

/** The pre-commit line: the scanned directory, relative to the repo root husky runs from. */
export const hookLine = (
	root: string,
	targetPath: string,
	version: string
): string => {
	let resolved = targetPath;
	try {
		resolved = realpathSync(targetPath);
	} catch {
		// A missing target keeps the path as given.
	}
	const target = relative(root, resolved).split(sep).join("/") || ".";
	return `npx nestjs-doctor@${version} ${target} --staged --blocking error`;
};

export type HookTool = "husky" | "lefthook" | "none" | "simple-git-hooks";

type HookInstallStatus =
	| "added"
	| "exists"
	| "failed"
	| "no-repo"
	| "no-tool"
	| "paste"
	| "symlink";

export interface HookInstallResult {
	path?: string;
	/** The line to add by hand when the tool's config is not edited for the user. */
	snippet?: string;
	status: HookInstallStatus;
	tool: HookTool;
}

const LEFTHOOK_FILES = ["lefthook.yml", "lefthook.yaml", ".lefthook.yml"];

const hasSimpleGitHooks = (root: string): boolean => {
	try {
		return (
			"simple-git-hooks" in
			JSON.parse(readFileSync(join(root, "package.json"), "utf-8"))
		);
	} catch {
		return false;
	}
};

/** The pre-commit tool a repository root is set up with. */
export const detectHookTool = (root: string): HookTool => {
	if (existsSync(join(root, ".husky"))) {
		return "husky";
	}
	if (LEFTHOOK_FILES.some((file) => existsSync(join(root, file)))) {
		return "lefthook";
	}
	if (hasSimpleGitHooks(root)) {
		return "simple-git-hooks";
	}
	return "none";
};

const pasteSnippet = (
	tool: Exclude<HookTool, "husky" | "none">,
	line: string
): string =>
	tool === "lefthook"
		? `pre-commit:\n  commands:\n    nestjs-doctor:\n      run: ${line}`
		: `"simple-git-hooks": { "pre-commit": "${line}" }`;

/** The pre-commit tool of the repository that contains `targetPath`. */
export const hookToolFor = (targetPath: string): HookTool => {
	const repo = findGitRepo(targetPath);
	return repo ? detectHookTool(repo.root) : "none";
};

/** The first symlink among `.husky` and its pre-commit file, or null. */
const findSymlink = (root: string): string | null => {
	for (const segment of [".husky", join(".husky", "pre-commit")]) {
		const candidate = join(root, segment);
		try {
			if (lstatSync(candidate).isSymbolicLink()) {
				return candidate;
			}
		} catch {
			// Missing segments are created below.
		}
	}
	return null;
};

/** True when the repository's pre-commit hook already runs nestjs-doctor. */
export const hookInstalled = (targetPath: string): boolean => {
	const repo = findGitRepo(targetPath);
	if (!repo) {
		return false;
	}
	const file = join(repo.root, ".husky", "pre-commit");
	try {
		return readFileSync(file, "utf-8").includes("nestjs-doctor");
	} catch {
		return false;
	}
};

/** Appends the staged scan to husky's pre-commit hook; other tools get a snippet to paste. */
export const installHook = async (
	targetPath: string,
	version: string
): Promise<HookInstallResult> => {
	const repo = findGitRepo(targetPath);
	if (!repo) {
		return { status: "no-repo", tool: "none" };
	}
	const tool = detectHookTool(repo.root);
	if (tool === "none") {
		return { status: "no-tool", tool };
	}
	const line = hookLine(repo.root, targetPath, version);
	if (tool !== "husky") {
		return { snippet: pasteSnippet(tool, line), status: "paste", tool };
	}
	const symlink = findSymlink(repo.root);
	if (symlink) {
		return { path: symlink, status: "symlink", tool };
	}
	const path = join(repo.root, ".husky", "pre-commit");
	try {
		if (readFileSync(path, "utf-8").includes("nestjs-doctor")) {
			return { path, status: "exists", tool };
		}
	} catch {
		// A missing hook file is created below.
	}
	try {
		await mkdir(join(repo.root, ".husky"), { recursive: true });
		const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
		const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
		await appendFile(path, `${separator}${line}\n`, "utf-8");
		return { path, status: "added", tool };
	} catch {
		return { path, status: "failed", tool };
	}
};
