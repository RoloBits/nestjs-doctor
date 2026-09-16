import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const EMPTY_APP = join(FIXTURES, "empty-app");
const EMPTY_MONOREPO = join(FIXTURES, "empty-monorepo");
const BASIC_APP = join(FIXTURES, "basic-app");
const ENTRY = resolve(import.meta.dirname, "../../src/cli/index.ts");
const PRELOAD = pathToFileURL(
	resolve(import.meta.dirname, "helpers/source-cli-preload.mjs")
).href;
const ANSI = /\u001B\[[0-9;]*m/g;
const SCORE_LINE = /\b\d{1,3} \/ 100\b/;

const roots: string[] = [];
/** A throwaway directory for output files and the telemetry config, never the scan target. */
const scratch = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "nd-empty-dir-"));
	roots.push(dir);
	return dir;
};

afterAll(() => {
	for (const dir of roots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

interface Run {
	code: number | null;
	stderr: string;
	stdout: string;
}

/** Runs the CLI from source in a child process, telemetry off unless `env` says otherwise. */
const cli = (
	args: string[],
	env: Record<string, string | undefined> = {}
): Run => {
	const result = spawnSync(
		process.execPath,
		["--import", PRELOAD, ENTRY, ...args],
		{
			encoding: "utf-8",
			env: {
				...process.env,
				DO_NOT_TRACK: "1",
				NESTJS_DOCTOR_CONFIG_DIR: scratch(),
				...env,
			},
			timeout: 120_000,
		}
	);
	return {
		code: result.status,
		stderr: result.stderr.replace(ANSI, ""),
		stdout: result.stdout.replace(ANSI, ""),
	};
};

describe("scanning a directory with no TypeScript files", () => {
	it("prints where it looked on stderr, nothing on stdout, and exits 2", () => {
		const run = cli([EMPTY_APP]);

		expect(run.code).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain(
			`No TypeScript source files found under ${EMPTY_APP}`
		);
	});

	it("writes no file under --format json --output", () => {
		const out = join(scratch(), "report.json");

		const run = cli([EMPTY_APP, "--format", "json", "--output", out]);

		expect(run.code).toBe(2);
		expect(existsSync(out)).toBe(false);
	});

	it("writes no file under --report --output", () => {
		const out = join(scratch(), "report.html");

		const run = cli([EMPTY_APP, "--report", "--output", out]);

		expect(run.code).toBe(2);
		expect(existsSync(out)).toBe(false);
		expect(run.stderr).toContain("No TypeScript source files found under");
	});

	it("still reports the scan with a file count of zero", () => {
		const run = cli([EMPTY_APP, "--json"], {
			DO_NOT_TRACK: undefined,
			NESTJS_DOCTOR_TELEMETRY_DEBUG: "1",
			NODE_ENV: undefined,
			VITEST: undefined,
		});

		expect(run.code).toBe(2);
		expect(run.stderr).toContain('"event": "scan_completed"');
		expect(run.stderr).toContain('"file_count": 0');
	});

	it("scores a project that holds TypeScript files", () => {
		const run = cli([BASIC_APP]);

		expect(run.code).not.toBe(2);
		expect(run.stdout).toMatch(SCORE_LINE);
		expect(run.stderr).not.toContain("No TypeScript source files found");
	});

	it("names the workspace root when every package holds no TypeScript file", () => {
		const run = cli([EMPTY_MONOREPO]);

		expect(run.code).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain(
			`No TypeScript source files found under ${EMPTY_MONOREPO}`
		);
	});
});
