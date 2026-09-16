import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ENTRY = resolve(import.meta.dirname, "../../src/cli/index.ts");
const PRELOAD = pathToFileURL(
	resolve(import.meta.dirname, "helpers/source-cli-preload.mjs")
).href;
const ANSI = /\u001B\[[0-9;]*m/g;
const SCORE_LINE = /\b\d{1,3} \/ 100\b/;

const roots: string[] = [];
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

const nestPackage = (dir: string, name: string): void => {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify({ name, dependencies: { "@nestjs/core": "^11.0.0" } })
	);
};

describe("scanning a directory with no TypeScript files", () => {
	it("prints where it looked on stderr, nothing on stdout, and exits 2", () => {
		const dir = scratch();

		const run = cli([dir]);

		expect(run.code).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain(
			`No TypeScript source files found under ${dir}`
		);
	});

	it("writes no file under --format json --output", () => {
		const dir = scratch();
		const out = join(scratch(), "report.json");

		const run = cli([dir, "--format", "json", "--output", out]);

		expect(run.code).toBe(2);
		expect(existsSync(out)).toBe(false);
	});

	it("writes no file under --report --output", () => {
		const dir = scratch();
		const out = join(scratch(), "report.html");

		const run = cli([dir, "--report", "--output", out]);

		expect(run.code).toBe(2);
		expect(existsSync(out)).toBe(false);
		expect(run.stderr).toContain("No TypeScript source files found under");
	});

	it("still reports the scan with a file count of zero", () => {
		const dir = scratch();

		const run = cli([dir, "--json"], {
			DO_NOT_TRACK: undefined,
			NESTJS_DOCTOR_TELEMETRY_DEBUG: "1",
			NODE_ENV: undefined,
			VITEST: undefined,
		});

		expect(run.code).toBe(2);
		expect(run.stderr).toContain('"event": "scan_completed"');
		expect(run.stderr).toContain('"file_count": 0');
	});

	it("scores a directory that holds one TypeScript file", () => {
		const dir = scratch();
		mkdirSync(join(dir, "src"));
		writeFileSync(join(dir, "src", "util.ts"), "export const answer = 42;\n");

		const run = cli([dir]);

		expect(run.code).not.toBe(2);
		expect(run.stdout).toMatch(SCORE_LINE);
		expect(run.stderr).not.toContain("No TypeScript source files found");
	});

	it("names the workspace root when every package holds no TypeScript file", () => {
		const dir = scratch();
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "root" }));
		writeFileSync(
			join(dir, "pnpm-workspace.yaml"),
			"packages:\n  - packages/*\n"
		);
		nestPackage(join(dir, "packages", "api"), "api");
		nestPackage(join(dir, "packages", "worker"), "worker");

		const run = cli([dir]);

		expect(run.code).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain(
			`No TypeScript source files found under ${dir}`
		);
	});
});
