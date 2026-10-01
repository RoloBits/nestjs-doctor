import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { findGitRepo } from "../engine/git.js";
import { findSymlink } from "./ci-install.js";

export type HookTool = "husky" | "lefthook" | "none" | "simple-git-hooks";

type PasteTool = Exclude<HookTool, "husky" | "none">;

export type HookInstallResult =
	| { status: "created"; path: string }
	| { status: "exists" }
	| { status: "failed"; path: string }
	| { status: "no-repo" }
	| { status: "no-tool" }
	| { status: "paste"; snippet: string; tool: PasteTool }
	| { status: "symlink"; path: string };

const LEFTHOOK_FILES = ["lefthook.yml", "lefthook.yaml", ".lefthook.yml"];
const HUSKY_HOOK = join(".husky", "pre-commit");
const HOOK_COMMENT =
	"# nestjs-doctor: block the commit on error-level findings in staged files";

/** The pre-commit line: `prefix` is the scanned directory inside the repo, as git reports it. */
export const hookLine = (prefix: string, version: string): string =>
	`npx --yes nestjs-doctor@${version} ${prefix || "."} --staged --blocking error`;

const read = (file: string): string => {
	try {
		return readFileSync(file, "utf-8");
	} catch {
		return "";
	}
};

/** The files a tool reads its pre-commit command from. */
const toolFiles = (root: string, tool: HookTool): string[] => {
	if (tool === "husky") {
		return [join(root, HUSKY_HOOK)];
	}
	if (tool === "lefthook") {
		return LEFTHOOK_FILES.map((file) => join(root, file));
	}
	if (tool === "simple-git-hooks") {
		return [join(root, "package.json")];
	}
	return [];
};

/** The pre-commit tool a repository root is set up with. */
export const detectHookTool = (root: string): HookTool => {
	if (existsSync(join(root, ".husky"))) {
		return "husky";
	}
	if (LEFTHOOK_FILES.some((file) => read(join(root, file)) !== "")) {
		return "lefthook";
	}
	if (read(join(root, "package.json")).includes('"simple-git-hooks"')) {
		return "simple-git-hooks";
	}
	return "none";
};

/** True when the tool's own config already runs nestjs-doctor. */
export const hookPresent = (root: string, tool: HookTool): boolean =>
	toolFiles(root, tool).some((file) => read(file).includes("nestjs-doctor"));

const pasteSnippet = (tool: PasteTool, line: string): string =>
	tool === "lefthook"
		? `pre-commit:\n  commands:\n    nestjs-doctor:\n      run: ${line}`
		: `"pre-commit": "${line}"`;

/** Appends the staged scan to husky's pre-commit hook; other tools get a snippet to paste. */
export const installHook = async (
	targetPath: string,
	version: string
): Promise<HookInstallResult> => {
	const repo = findGitRepo(targetPath);
	if (!repo) {
		return { status: "no-repo" };
	}
	const tool = detectHookTool(repo.root);
	if (tool === "none") {
		return { status: "no-tool" };
	}
	if (hookPresent(repo.root, tool)) {
		return { status: "exists" };
	}
	const line = hookLine(repo.prefix, version);
	if (tool !== "husky") {
		return { snippet: pasteSnippet(tool, line), status: "paste", tool };
	}
	const symlink = findSymlink(repo.root, [".husky", HUSKY_HOOK]);
	if (symlink) {
		return { path: symlink, status: "symlink" };
	}
	const path = join(repo.root, HUSKY_HOOK);
	try {
		await mkdir(join(repo.root, ".husky"), { recursive: true });
		const existing = read(path);
		const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
		await appendFile(path, `${separator}${HOOK_COMMENT}\n${line}\n`, "utf-8");
		return { path, status: "created" };
	} catch {
		return { path, status: "failed" };
	}
};
