import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { AGENT_HINT } from "../../src/cli/trigger-hint.js";
import { isNonInteractiveEnvironment } from "../../src/cli/ui/environment.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const BASIC_APP = join(FIXTURES, "basic-app");
const EMPTY_APP = join(FIXTURES, "empty-app");
const ENTRY = resolve(import.meta.dirname, "../../src/cli/index.ts");
const PRELOAD = pathToFileURL(
	resolve(import.meta.dirname, "helpers/source-cli-preload.mjs")
).href;
const ELAPSED = /in \d+(\.\d+)?m?s/g;

/** The parent env without CI, agent, or git hook variables. */
const BASE_ENV = Object.fromEntries(
	Object.entries(process.env).filter(
		([name]) =>
			!(name.startsWith("GIT_") || isNonInteractiveEnvironment({ [name]: "1" }))
	)
);

const roots: string[] = [];
const scratch = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "nd-agent-hint-"));
	roots.push(dir);
	return dir;
};

afterAll(() => {
	for (const dir of roots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** Runs the CLI from source with stderr piped, as a coding agent would, under a clean env. */
const agentRun = (args: string[], configDir: string) => {
	const home = scratch();
	const result = spawnSync(
		process.execPath,
		["--import", PRELOAD, ENTRY, ...args],
		{
			encoding: "utf-8",
			env: {
				...BASE_ENV,
				CLAUDECODE: "1",
				DO_NOT_TRACK: "1",
				HOME: home,
				NESTJS_DOCTOR_CONFIG_DIR: configDir,
				USERPROFILE: home,
			},
			timeout: 120_000,
		}
	);
	return { code: result.status, stderr: result.stderr, stdout: result.stdout };
};

describe("the piped agent line", { timeout: 120_000 }, () => {
	it("prints once per project on stderr and leaves stdout alone", () => {
		const config = scratch();
		const first = agentRun([BASIC_APP], config);
		const second = agentRun([BASIC_APP], config);

		expect(first.code).toBe(0);
		expect(first.stderr).toContain(`${AGENT_HINT}\n`);
		expect(first.stdout).not.toContain("--init");
		expect(second.stderr).not.toContain(AGENT_HINT);
		expect(first.stdout.replace(ELAPSED, "")).toBe(
			second.stdout.replace(ELAPSED, "")
		);
	});

	it("prints nowhere for --json or --format", () => {
		for (const args of [["--json"], ["--format", "sarif"]]) {
			const run = agentRun([BASIC_APP, ...args], scratch());
			expect(run.stderr).not.toContain(AGENT_HINT);
		}
	});

	it("prints nowhere after a zero-file or failed scan", () => {
		const badConfig = join(scratch(), "bad.json");
		writeFileSync(badConfig, "{bad");

		expect(agentRun([EMPTY_APP], scratch()).stderr).not.toContain(AGENT_HINT);
		expect(
			agentRun([BASIC_APP, "--config", badConfig], scratch()).stderr
		).not.toContain(AGENT_HINT);
	});
});
