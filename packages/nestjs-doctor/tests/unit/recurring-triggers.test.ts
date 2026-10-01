import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	ciWorkflowExists,
	installCiWorkflow,
} from "../../src/cli/ci-install.js";
import {
	detectHookTool,
	hookPresent,
	installHook,
} from "../../src/cli/hook-install.js";
import {
	chooseTriggerOffer,
	triggerHintLine,
} from "../../src/cli/trigger-hint.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const WORKFLOW = join(".github", "workflows", "nestjs-doctor.yml");
const HOOK = join(".husky", "pre-commit");
const VERSION = "1.2.3";

const dirs: string[] = [];

/** A copy of a fixture inside a fresh git repository, with the hook env cleared. */
const checkout = (fixture: string): string => {
	const root = mkdtempSync(join(tmpdir(), `nd-${fixture}-`));
	dirs.push(root);
	cpSync(join(FIXTURES, fixture), root, { recursive: true });
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

describe("a single project (basic-app)", () => {
	it("offers the skill when nothing recurs yet, and the Action once a workflows dir exists", () => {
		const root = checkout("basic-app");

		expect(chooseTriggerOffer(root)).toBe("skill");

		mkdirSync(join(root, ".github", "workflows"), { recursive: true });
		expect(chooseTriggerOffer(root)).toBe("action");
	});

	it("writes the workflow once and then stops offering the Action", async () => {
		const root = checkout("basic-app");
		mkdirSync(join(root, ".github", "workflows"), { recursive: true });

		expect((await installCiWorkflow(root, false)).status).toBe("created");
		expect(existsSync(join(root, WORKFLOW))).toBe(true);
		expect(ciWorkflowExists(root)).toBe(true);
		expect((await installCiWorkflow(root, false)).status).toBe("exists");
		expect(chooseTriggerOffer(root)).toBe("skill");
	});

	it("appends a root scan to husky once and then stops offering the hook", async () => {
		const root = checkout("basic-app");
		mkdirSync(join(root, ".husky"));
		writeFileSync(join(root, HOOK), "npm test\n");

		expect(detectHookTool(root)).toBe("husky");
		expect(chooseTriggerOffer(root)).toBe("hook");

		expect((await installHook(root, VERSION)).status).toBe("created");
		expect(readFileSync(join(root, HOOK), "utf-8")).toContain(
			`npx --yes nestjs-doctor@${VERSION} . --staged --blocking error`
		);
		expect(hookPresent(root, "husky")).toBe(true);
		expect((await installHook(root, VERSION)).status).toBe("exists");
		expect(chooseTriggerOffer(root)).toBe("skill");
	});

	it("reports no tool when the repo has no hook runner", async () => {
		const root = checkout("basic-app");

		expect((await installHook(root, VERSION)).status).toBe("no-tool");
	});
});

describe("a monorepo scanned from one app (monorepo-app/apps/api)", () => {
	it("puts the workflow at the repo root, not under the app", async () => {
		const root = checkout("monorepo-app");
		const api = join(root, "apps", "api");
		mkdirSync(join(root, ".github", "workflows"), { recursive: true });

		expect(chooseTriggerOffer(api)).toBe("action");
		expect((await installCiWorkflow(api, false)).status).toBe("created");
		expect(existsSync(join(root, WORKFLOW))).toBe(true);
		expect(existsSync(join(api, WORKFLOW))).toBe(false);
		expect(ciWorkflowExists(api)).toBe(true);
	});

	it("appends a hook line that scans only that app", async () => {
		const root = checkout("monorepo-app");
		const api = join(root, "apps", "api");
		mkdirSync(join(root, ".husky"));
		writeFileSync(join(root, HOOK), "npm test\n");

		expect(chooseTriggerOffer(api)).toBe("hook");
		expect(triggerHintLine("hook", api)).toContain("apps/api --staged");

		expect((await installHook(api, VERSION)).status).toBe("created");
		expect(readFileSync(join(root, HOOK), "utf-8")).toBe(
			`npm test\n# nestjs-doctor: block the commit on error-level findings in staged files\nnpx --yes nestjs-doctor@${VERSION} apps/api --staged --blocking error\n`
		);
		expect(hookPresent(root, "husky")).toBe(true);
		expect((await installHook(api, VERSION)).status).toBe("exists");
		expect(chooseTriggerOffer(api)).toBe("skill");
	});

	it("hands lefthook users a snippet naming the app and never edits lefthook.yml", async () => {
		const root = checkout("monorepo-app");
		const api = join(root, "apps", "api");
		writeFileSync(join(root, "lefthook.yml"), "pre-commit:\n");

		const outcome = await installHook(api, VERSION);

		expect(outcome.status).toBe("paste");
		expect(outcome.status === "paste" && outcome.snippet).toContain(
			`nestjs-doctor@${VERSION} apps/api --staged`
		);
		expect(readFileSync(join(root, "lefthook.yml"), "utf-8")).toBe(
			"pre-commit:\n"
		);
	});
});
