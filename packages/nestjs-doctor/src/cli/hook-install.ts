import { existsSync, lstatSync, readFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { findGitRepo } from "../engine/git.js";

export const HOOK_LINE = "npx nestjs-doctor@latest . --staged";

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

const PASTE_SNIPPETS: Record<Exclude<HookTool, "husky" | "none">, string> = {
	lefthook: `pre-commit:\n  commands:\n    nestjs-doctor:\n      run: ${HOOK_LINE}`,
	"simple-git-hooks": `"simple-git-hooks": { "pre-commit": "${HOOK_LINE}" }`,
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
	targetPath: string
): Promise<HookInstallResult> => {
	const repo = findGitRepo(targetPath);
	if (!repo) {
		return { status: "no-repo", tool: "none" };
	}
	const tool = detectHookTool(repo.root);
	if (tool === "none") {
		return { status: "no-tool", tool };
	}
	if (tool !== "husky") {
		return { snippet: PASTE_SNIPPETS[tool], status: "paste", tool };
	}
	const path = join(repo.root, ".husky", "pre-commit");
	try {
		if (lstatSync(path).isSymbolicLink()) {
			return { path, status: "symlink", tool };
		}
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
		await appendFile(path, `${separator}${HOOK_LINE}\n`, "utf-8");
		return { path, status: "added", tool };
	} catch {
		return { path, status: "failed", tool };
	}
};
