import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	detectHookTool,
	hookInstalled,
	hookLine,
	installHook,
} from "../../src/cli/hook-install.js";

const LINE = "npx nestjs-doctor@1.2.3 . --staged --blocking error";

const dirs: string[] = [];

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), "nd-hook-"));
	dirs.push(root);
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))
	);
	execFileSync("git", ["init", "-q"], { cwd: root, env });
	return root;
};

afterAll(() => {
	for (const dir of dirs) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("detectHookTool", () => {
	it("recognises husky, lefthook and simple-git-hooks", () => {
		const husky = repo();
		mkdirSync(join(husky, ".husky"));
		const lefthook = repo();
		writeFileSync(join(lefthook, "lefthook.yml"), "pre-commit:\n");
		const simple = repo();
		writeFileSync(
			join(simple, "package.json"),
			JSON.stringify({ "simple-git-hooks": {} })
		);

		expect(detectHookTool(husky)).toBe("husky");
		expect(detectHookTool(lefthook)).toBe("lefthook");
		expect(detectHookTool(simple)).toBe("simple-git-hooks");
		expect(detectHookTool(repo())).toBe("none");
	});
});

describe("installHook", () => {
	it("appends the staged scan to an existing husky hook, once", async () => {
		const root = repo();
		mkdirSync(join(root, ".husky"));
		const hook = join(root, ".husky", "pre-commit");
		writeFileSync(hook, "npm test");

		const outcome = await installHook(root, "1.2.3");

		expect(outcome.status).toBe("added");
		expect(outcome.path?.endsWith("/.husky/pre-commit")).toBe(true);
		expect(readFileSync(hook, "utf-8")).toBe(`npm test\n${LINE}\n`);
		expect(hookInstalled(root)).toBe(true);
		expect((await installHook(root, "1.2.3")).status).toBe("exists");
	});

	it("creates the hook file when husky has none yet", async () => {
		const root = repo();
		mkdirSync(join(root, ".husky"));

		expect((await installHook(root, "1.2.3")).status).toBe("added");
		expect(readFileSync(join(root, ".husky", "pre-commit"), "utf-8")).toBe(
			`${LINE}\n`
		);
	});

	it("hands lefthook users a snippet instead of editing their yaml", async () => {
		const root = repo();
		writeFileSync(join(root, "lefthook.yml"), "pre-commit:\n");

		const outcome = await installHook(root, "1.2.3");

		expect(outcome.status).toBe("paste");
		expect(outcome.snippet).toContain(LINE);
		expect(readFileSync(join(root, "lefthook.yml"), "utf-8")).toBe(
			"pre-commit:\n"
		);
	});

	it("refuses to write through a symlinked hook", async () => {
		const root = repo();
		mkdirSync(join(root, ".husky"));
		writeFileSync(join(root, "elsewhere"), "");
		symlinkSync(join(root, "elsewhere"), join(root, ".husky", "pre-commit"));

		expect((await installHook(root, "1.2.3")).status).toBe("symlink");
	});

	it("refuses to write through a symlinked .husky directory", async () => {
		const root = repo();
		const elsewhere = mkdtempSync(join(tmpdir(), "nd-hook-shared-"));
		dirs.push(elsewhere);
		symlinkSync(elsewhere, join(root, ".husky"));

		expect((await installHook(root, "1.2.3")).status).toBe("symlink");
	});

	it("scans the directory that was scanned, relative to the repo root", async () => {
		const root = repo();
		mkdirSync(join(root, ".husky"));
		mkdirSync(join(root, "apps", "api"), { recursive: true });

		await installHook(join(root, "apps", "api"), "1.2.3");

		expect(readFileSync(join(root, ".husky", "pre-commit"), "utf-8")).toBe(
			"npx nestjs-doctor@1.2.3 apps/api --staged --blocking error\n"
		);
		expect(hookLine("/r", "/r", "0.1.0")).toBe(
			"npx nestjs-doctor@0.1.0 . --staged --blocking error"
		);
	});

	it("reports no tool and no repo", async () => {
		expect((await installHook(repo(), "1.2.3")).status).toBe("no-tool");
		const plain = mkdtempSync(join(tmpdir(), "nd-hook-plain-"));
		dirs.push(plain);
		expect((await installHook(plain, "1.2.3")).status).toBe("no-repo");
	});
});
