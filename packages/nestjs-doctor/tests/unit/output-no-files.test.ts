import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	outputMonorepoResults,
	outputSingleProjectResults,
} from "../../src/cli/output.js";
import type { PipelineOptions } from "../../src/cli/setup.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import type {
	EngineResult,
	MonorepoEngineResult,
} from "../../src/engine/scanner.js";
import { emptyResult } from "./report-artifact-fixture.js";

const ANSI = /\[[0-9;]*m/g;
const TARGET = "/repo/not-a-nest-app";

const noFiles = (): DiagnoseResult => {
	const result = emptyResult();
	return { ...result, project: { ...result.project, fileCount: 0 } };
};

const engineResult = (result: DiagnoseResult): EngineResult =>
	({
		customRuleWarnings: [],
		files: [],
		moduleGraph: {
			edges: new Map(),
			modules: new Map(),
			providerToModule: new Map(),
		},
		providers: new Map(),
		result,
		schemaGraph: { entities: [], relations: [] },
	}) as unknown as EngineResult;

const options = (
	overrides: Partial<PipelineOptions> = {}
): PipelineOptions => ({
	base: undefined,
	blocking: "error",
	changedFilesFrom: undefined,
	configPath: undefined,
	format: "console",
	interactive: false,
	isMachineReadable: false,
	jsonCompact: false,
	minScore: undefined,
	outputPath: undefined,
	scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
	scope: "full",
	score: false,
	shareCode: false,
	shareSections: undefined,
	sources: "all",
	staged: false,
	telemetry: false,
	verbose: false,
	...overrides,
});

describe("a scan that collected no files", () => {
	let stdout: string[];
	let stderr: string[];

	beforeEach(() => {
		stdout = [];
		stderr = [];
		vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			stdout.push(args.join(" ").replace(ANSI, ""));
		});
		vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
			stderr.push(args.join(" ").replace(ANSI, ""));
		});
		process.exitCode = undefined;
	});

	afterEach(() => {
		process.exitCode = undefined;
		vi.restoreAllMocks();
	});

	it("explains where it looked instead of printing a score", async () => {
		await outputSingleProjectResults(
			engineResult(noFiles()),
			undefined,
			TARGET,
			options()
		);

		const err = stderr.join("\n");
		expect(err).toContain(`No TypeScript source files found under ${TARGET}`);
		expect(err).toContain("Looked for **/*.ts");
		expect(err).toContain("npx nestjs-doctor@latest apps/api");
		expect(stdout.join("\n")).not.toContain("100");
		expect(stdout.join("\n")).not.toContain("NestJS Doctor");
	});

	it("exits 2, the same as a path that does not exist", async () => {
		await outputSingleProjectResults(
			engineResult(noFiles()),
			undefined,
			TARGET,
			options()
		);

		expect(process.exitCode).toBe(2);
	});

	it("prints no number under --score", async () => {
		await outputSingleProjectResults(
			engineResult(noFiles()),
			undefined,
			TARGET,
			options({ isMachineReadable: true, score: true })
		);

		expect(stdout).toEqual([]);
		expect(process.exitCode).toBe(2);
	});

	it("writes no payload under --format json", async () => {
		await outputSingleProjectResults(
			engineResult(noFiles()),
			undefined,
			TARGET,
			options({ format: "json", isMachineReadable: true })
		);

		expect(stdout).toEqual([]);
		expect(stderr.join("\n")).toContain("No TypeScript source files found");
		expect(process.exitCode).toBe(2);
	});

	it("applies to a monorepo whose combined result is empty", async () => {
		const combined = noFiles();
		await outputMonorepoResults(
			{
				result: { combined, subProjects: [] },
			} as unknown as MonorepoEngineResult,
			undefined,
			TARGET,
			options()
		);

		expect(stderr.join("\n")).toContain("No TypeScript source files found");
		expect(stdout.join("\n")).not.toContain("NestJS Doctor");
		expect(process.exitCode).toBe(2);
	});

	it("leaves a scan that found files alone", async () => {
		await outputSingleProjectResults(
			engineResult(emptyResult()),
			undefined,
			TARGET,
			options()
		);

		expect(stdout.join("\n")).toContain("NestJS Doctor");
		expect(process.exitCode).toBeUndefined();
	});
});
