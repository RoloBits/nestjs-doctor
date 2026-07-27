import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The git helpers normalise to posix on every platform by design, so a link
// built with `join` has to be normalised before it can be compared to one.
const BACKSLASH_RE = /\\/g;
const toPosix = (path: string): string => path.replace(BACKSLASH_RE, "/");

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	checkoutBase,
	findGitRepo,
	type GitRepo,
	getChangedFiles,
	getChangedLineRanges,
	getStagedFiles,
	parseDiffLineRanges,
	refExists,
	resolveBaseRef,
	runGit,
} from "../../src/engine/git.js";

const git = (cwd: string, ...args: string[]): void => {
	execFileSync("git", args, { cwd, stdio: "ignore" });
};

describe("git helpers", () => {
	let root: string;
	let repo: GitRepo;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "nestjs-doctor-git-test-"));
		git(root, "init", "-q", ".");
		git(root, "config", "user.email", "test@example.com");
		git(root, "config", "user.name", "Test");
		git(root, "config", "commit.gpgsign", "false");

		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src/a.ts"), "const a = 1;\nconst b = 2;\n");
		writeFileSync(join(root, "src/keep.ts"), "const keep = 1;\n");
		git(root, "add", "-A");
		git(root, "commit", "-qm", "base");

		writeFileSync(
			join(root, "src/a.ts"),
			"const a = 1;\nconst inserted = 0;\nconst b = 2;\n"
		);
		writeFileSync(join(root, "src/new.ts"), "const c = 3;\n");
		git(root, "add", "-A");
		git(root, "commit", "-qm", "head");

		repo = findGitRepo(root) as GitRepo;
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("finds the repository root", () => {
		expect(repo).not.toBeNull();
		expect(findGitRepo(join(root, "src"))?.root).toBe(repo.root);
	});

	it("returns null outside a repository", () => {
		const loose = mkdtempSync(join(tmpdir(), "nestjs-doctor-not-git-"));
		try {
			// A stray parent repository would make this pass for the wrong reason,
			// so only assert the shape when the temp dir really is standalone.
			const found = findGitRepo(loose);
			if (found) {
				expect(found.root).not.toBe(loose);
			} else {
				expect(found).toBeNull();
			}
		} finally {
			rmSync(loose, { recursive: true, force: true });
		}
	});

	it("returns null rather than throwing on a failed command", () => {
		expect(runGit(root, ["definitely-not-a-git-command"])).toBeNull();
	});

	it("recognises refs that exist and rejects ones that do not", () => {
		expect(refExists(repo, "HEAD")).toBe(true);
		expect(refExists(repo, "refs/heads/does-not-exist")).toBe(false);
	});

	it("resolves an explicit base only when it is reachable", () => {
		expect(resolveBaseRef(repo, "HEAD~1")).toBe("HEAD~1");
		expect(resolveBaseRef(repo, "nope/nope")).toBeNull();
	});

	it("lists the files a commit added or modified", () => {
		const changed = getChangedFiles(repo, "HEAD~1");
		expect(changed).not.toBeNull();
		const names = (changed ?? []).map((path) => path.split("/").pop());
		expect(names).toContain("a.ts");
		expect(names).toContain("new.ts");
		expect(names).not.toContain("keep.ts");
	});

	it("restricts the changed set to the scanned subdirectory", () => {
		const scoped = findGitRepo(join(root, "src")) as GitRepo;
		const changed = getChangedFiles(scoped, "HEAD~1") ?? [];
		expect(changed.length).toBeGreaterThan(0);
		expect(changed.every((path) => path.includes("/src/"))).toBe(true);
	});

	it("derives the changed line ranges on the new side", () => {
		const ranges = getChangedLineRanges(repo, "HEAD~1");
		expect(ranges).not.toBeNull();
		const forA = [...(ranges ?? new Map())].find(([path]) =>
			path.endsWith("/src/a.ts")
		)?.[1];
		// Only line 2 was inserted; lines 1 and 3 are untouched context.
		expect(forA).toEqual([{ start: 2, end: 2 }]);
	});

	it("lists staged files", () => {
		writeFileSync(join(root, "src/staged.ts"), "const s = 1;\n");
		git(root, "add", "src/staged.ts");
		try {
			const staged = getStagedFiles(repo) ?? [];
			expect(staged.map((path) => path.split("/").pop())).toEqual([
				"staged.ts",
			]);
		} finally {
			git(root, "reset", "-q");
			rmSync(join(root, "src/staged.ts"), { force: true });
		}
	});

	it("checks the base revision out into a disposable worktree", () => {
		const checkout = checkoutBase(repo, "HEAD~1");
		expect(checkout).not.toBeNull();
		if (!checkout) {
			return;
		}
		try {
			const { readFileSync } = require("node:fs") as typeof import("node:fs");
			// The base content, not HEAD's.
			expect(
				readFileSync(join(checkout.targetPath, "src/a.ts"), "utf-8")
			).not.toContain("inserted");
		} finally {
			checkout.cleanup();
			// Cleanup is idempotent, so a `finally` on an already-cleaned checkout
			// cannot throw.
			checkout.cleanup();
		}
	});

	it("returns null when the base revision is unreachable", () => {
		expect(
			checkoutBase(repo, "0000000000000000000000000000000000000000")
		).toBeNull();
	});

	it("resolves a repository reached through a symlink", () => {
		// macOS hands out `/var/...` and `/tmp/...` paths that are symlinks to
		// `/private/...`, and git always reports the canonical form. Deciding
		// containment by comparing those two absolute paths matches nothing, which
		// empties the changed-file set — a scoped scan then reports zero findings
		// on a change that has plenty. Reproduced here with an explicit symlink so
		// it is caught on every platform, not just macOS.
		const link = join(tmpdir(), `nestjs-doctor-symlink-${process.pid}`);
		rmSync(link, { force: true });
		symlinkSync(root, link, "dir");

		try {
			const viaLink = findGitRepo(link);
			expect(viaLink).not.toBeNull();
			if (!viaLink) {
				return;
			}

			const changed = getChangedFiles(viaLink, "HEAD~1") ?? [];
			expect(changed.map((path) => path.split("/").pop())).toContain("a.ts");
			// Paths come back in the caller's own space, so they still match the
			// file paths the scanner puts on diagnostics.
			expect(changed.every((path) => path.startsWith(toPosix(link)))).toBe(
				true
			);

			const ranges = getChangedLineRanges(viaLink, "HEAD~1");
			expect(ranges?.size).toBeGreaterThan(0);
		} finally {
			rmSync(link, { force: true });
		}
	});

	it("scopes to a subdirectory reached through a symlink", () => {
		const link = join(tmpdir(), `nestjs-doctor-symlink-sub-${process.pid}`);
		rmSync(link, { force: true });
		symlinkSync(root, link, "dir");

		try {
			const scoped = findGitRepo(join(link, "src"));
			expect(scoped?.prefix).toBe("src");

			const changed = scoped ? (getChangedFiles(scoped, "HEAD~1") ?? []) : [];
			expect(changed.length).toBeGreaterThan(0);
			expect(
				changed.every((path) => path.startsWith(`${toPosix(link)}/src/`))
			).toBe(true);
		} finally {
			rmSync(link, { force: true });
		}
	});

	it("ignores the repository-scoping git variables a hook leaves in the environment", () => {
		// Git exports GIT_DIR and friends to every hook it runs, and a hook's
		// children inherit them — so `nestjs-doctor --staged` from a husky
		// pre-commit would otherwise resolve refs against the hook's repository
		// instead of the scanned one. The symptom is deceptive: `--show-toplevel`
		// still honours `-C`, while ref resolution silently targets the wrong repo.
		const other = mkdtempSync(join(tmpdir(), "nestjs-doctor-hook-env-"));
		const saved = {
			GIT_DIR: process.env.GIT_DIR,
			GIT_INDEX_FILE: process.env.GIT_INDEX_FILE,
			GIT_WORK_TREE: process.env.GIT_WORK_TREE,
		};

		try {
			git(other, "init", "-q", ".");
			git(other, "config", "user.email", "test@example.com");
			git(other, "config", "user.name", "Test");
			git(other, "config", "commit.gpgsign", "false");
			writeFileSync(join(other, "only.txt"), "single commit\n");
			git(other, "add", "-A");
			git(other, "commit", "-qm", "only");

			process.env.GIT_DIR = join(other, ".git");
			process.env.GIT_INDEX_FILE = join(other, ".git/index");
			process.env.GIT_WORK_TREE = other;

			// `other` has a single commit, so a leaked GIT_DIR makes HEAD~1
			// unresolvable and every one of these fails.
			expect(getChangedFiles(repo, "HEAD~1")).not.toBeNull();

			const checkout = checkoutBase(repo, "HEAD~1");
			expect(checkout).not.toBeNull();
			checkout?.cleanup();
		} finally {
			for (const [name, value] of Object.entries(saved)) {
				if (value === undefined) {
					delete process.env[name];
				} else {
					process.env[name] = value;
				}
			}
			rmSync(other, { recursive: true, force: true });
		}
	});
});

describe("parseDiffLineRanges", () => {
	const repo: GitRepo = { prefix: "", root: "/repo", targetPath: "/repo" };

	it("reads single-line and multi-line hunks", () => {
		const diff = [
			"diff --git a/src/a.ts b/src/a.ts",
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -1 +1 @@",
			"@@ -10,0 +11,3 @@",
			"",
		].join("\n");
		expect(parseDiffLineRanges(repo, diff).get("/repo/src/a.ts")).toEqual([
			{ start: 1, end: 1 },
			{ start: 11, end: 13 },
		]);
	});

	it("ignores pure deletions, which touch no new-side line", () => {
		const diff = [
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -4,2 +3,0 @@",
			"",
		].join("\n");
		expect(parseDiffLineRanges(repo, diff).get("/repo/src/a.ts")).toEqual([]);
	});

	it("skips deleted files and paths outside the scanned directory", () => {
		const repoScoped: GitRepo = {
			prefix: "apps/api",
			root: "/repo",
			targetPath: "/repo/apps/api",
		};
		const diff = [
			"--- a/src/gone.ts",
			"+++ /dev/null",
			"@@ -1,3 +0,0 @@",
			"--- a/libs/x.ts",
			"+++ b/libs/x.ts",
			"@@ -1 +1,2 @@",
			"--- a/apps/api/src/y.ts",
			"+++ b/apps/api/src/y.ts",
			"@@ -1 +5,1 @@",
			"",
		].join("\n");
		const ranges = parseDiffLineRanges(repoScoped, diff);
		expect([...ranges.keys()]).toEqual(["/repo/apps/api/src/y.ts"]);
		expect(ranges.get("/repo/apps/api/src/y.ts")).toEqual([
			{ start: 5, end: 5 },
		]);
	});
});
