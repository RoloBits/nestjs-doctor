import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	chooseTriggerOffer,
	triggerHintKey,
	triggerHintLine,
	triggerHintSite,
} from "../../src/cli/trigger-hint.js";
import { AGENT_ENV_VARS } from "../../src/telemetry/environment.js";
import { markHint, readHints } from "../../src/telemetry/install-id.js";

const HASH_KEY = /^trigger:[0-9a-f]{16}$/;

const dirs: string[] = [];

/** A fresh repository; the offer detection asks git for the root. */
const gitRepo = (prefix: string): string => {
	const root = tmp(prefix);
	execFileSync("git", ["init", "-q"], { cwd: root });
	return root;
};

const tmp = (prefix: string): string => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
};

/** A plain npx run in a terminal, nothing recorded yet. */
const site = (
	overrides: Partial<Parameters<typeof triggerHintSite>[0]> = {}
): "menu" | "none" | "run" =>
	triggerHintSite({
		env: { npm_command: "exec" },
		hints: {},
		interactive: false,
		isMachineReadable: false,
		targetPath: "/repo/one",
		tty: true,
		...overrides,
	});

afterAll(() => {
	for (const dir of dirs) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("where the trigger hint prints", () => {
	it("prints at the end of an npx run", () => {
		expect(site()).toBe("run");
	});

	it("waits for the menu on an interactive run", () => {
		expect(site({ interactive: true })).toBe("menu");
	});

	it("prints nowhere when the run already has a recurring trigger", () => {
		expect(site({ env: { GIT_DIR: ".git" } })).toBe("none");
		expect(site({ env: { CI: "1" } })).toBe("none");
		expect(site({ env: { NESTJS_DOCTOR_TRIGGER: "action" } })).toBe("none");
		for (const name of AGENT_ENV_VARS) {
			expect(site({ env: { [name]: "1" } })).toBe("none");
		}
	});

	it("prints nowhere for machine-readable output or without a TTY", () => {
		expect(site({ isMachineReadable: true })).toBe("none");
		expect(site({ tty: false })).toBe("none");
	});

	it("prints once per project, and again for another project", () => {
		const env = { NESTJS_DOCTOR_CONFIG_DIR: tmp("nd-trigger-") };

		expect(site({ hints: readHints(env) })).toBe("run");
		markHint(triggerHintKey("/repo/one"), env, "skill");

		expect(site({ hints: readHints(env) })).toBe("none");
		expect(site({ hints: readHints(env), targetPath: "/repo/two" })).toBe(
			"run"
		);
		expect(readHints(env)[triggerHintKey("/repo/one")]).toBe("skill");
	});

	it("keys by a short hash of the path, never the path itself", () => {
		const key = triggerHintKey("/Users/someone/secret-project");

		expect(key).toMatch(HASH_KEY);
		expect(key).not.toContain("secret");
	});
});

describe("which trigger is offered", () => {
	it("offers the skill outside a git repository", () => {
		expect(chooseTriggerOffer(tmp("nd-offer-plain-"))).toBe("skill");
	});

	it("offers the Action when workflows exist but ours does not", () => {
		const root = gitRepo("nd-offer-gh-");
		mkdirSync(join(root, ".github", "workflows"), { recursive: true });

		expect(chooseTriggerOffer(root)).toBe("action");
	});

	it("offers the hook when husky is set up", () => {
		const root = gitRepo("nd-offer-husky-");
		mkdirSync(join(root, ".husky"));

		expect(chooseTriggerOffer(root)).toBe("hook");
	});

	it("names the command in every line", () => {
		expect(triggerHintLine("skill")).toContain("--init");
		expect(triggerHintLine("action")).toContain("ci install");
		expect(triggerHintLine("hook")).toContain("--staged");
	});
});
