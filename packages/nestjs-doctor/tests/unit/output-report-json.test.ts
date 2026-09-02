import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { outputSingleProjectResults } from "../../src/cli/output.js";
import type { PipelineOptions } from "../../src/cli/setup.js";
import type { EngineResult } from "../../src/engine/scanner.js";
import { logger } from "../../src/ui/logger.js";
import { EMPTY_ARTIFACT, emptyResult } from "./report-artifact-fixture.js";

const engineResult = () =>
	({
		customRuleWarnings: [],
		files: [],
		moduleGraph: {
			edges: new Map(),
			modules: new Map(),
			providerToModule: new Map(),
		},
		providers: new Map(),
		result: emptyResult(),
		schemaGraph: { entities: [], relations: [] },
	}) as unknown as EngineResult;

const options = (format: PipelineOptions["format"]): PipelineOptions => ({
	base: undefined,
	blocking: "none",
	changedFilesFrom: undefined,
	configPath: undefined,
	format,
	interactive: false,
	isMachineReadable: true,
	jsonCompact: false,
	minScore: undefined,
	outputPath: undefined,
	scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
	scope: "full",
	score: false,
	sources: "all",
	staged: false,
	telemetry: false,
	verbose: false,
});

describe("report-json output", () => {
	it("builds the artifact only when the format needs it", () => {
		const build = vi.fn(() => EMPTY_ARTIFACT);

		outputSingleProjectResults(
			engineResult(),
			undefined,
			"/does-not-matter",
			options("console"),
			[],
			build
		);

		expect(build).not.toHaveBeenCalled();
	});

	it("writes the artifact beside the target for report-json", () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-report-json-"));
		let builds = 0;
		outputSingleProjectResults(
			engineResult(),
			undefined,
			dir,
			options("report-json"),
			[],
			() => {
				builds++;
				return EMPTY_ARTIFACT;
			}
		);

		expect(builds).toBe(1);
		const written = readFileSync(
			join(dir, "nestjs-doctor-report.json"),
			"utf-8"
		);
		expect(JSON.parse(written)).toMatchObject({ schemaVersion: 1 });
	});

	it("warns and writes nothing when no builder produces an artifact", () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-report-json-"));
		const warn = vi
			.spyOn(logger, "warn")
			// biome-ignore lint/suspicious/noEmptyBlockStatements: silencing stderr in a test
			.mockImplementation(() => {});

		outputSingleProjectResults(
			engineResult(),
			undefined,
			dir,
			options("report-json"),
			[]
		);

		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
		expect(existsSync(join(dir, "nestjs-doctor-report.json"))).toBe(false);
	});
});
