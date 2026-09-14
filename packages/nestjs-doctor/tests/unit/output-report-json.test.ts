import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { outputSingleProjectResults } from "../../src/cli/output.js";
import type { PipelineOptions } from "../../src/cli/setup.js";
import { encodeCodeGraph } from "../../src/common/code-graph-codec.js";
import type { EngineResult } from "../../src/engine/scanner.js";
import { logger } from "../../src/ui/logger.js";
import {
	DESCENT_GRAPH,
	EMPTY_ARTIFACT,
	emptyResult,
} from "./report-artifact-fixture.js";

const EXPLAIN_HEAD = /^POST \/a → AController\.handle/;
const BOOT_HEAD = /^boot: boot → ready in 40ms/;

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

	it("attaches each route's walk text to --format json when the graph exists", () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-json-"));
		const withRoutes = engineResult();
		withRoutes.result.endpoints = {
			endpoints: [
				{
					controllerClass: "AController",
					dependencies: [],
					endLine: 3,
					filePath: "src/a.controller.ts",
					handlerMethod: "handle",
					httpMethod: "POST",
					line: 1,
					returnType: null,
					routePath: "/a",
					swagger: null,
				},
			],
		};
		outputSingleProjectResults(
			withRoutes,
			undefined,
			dir,
			{ ...options("json"), outputPath: join(dir, "out.json") },
			[],
			() => ({ ...EMPTY_ARTIFACT, codeGraph: encodeCodeGraph(DESCENT_GRAPH) })
		);

		const out = JSON.parse(readFileSync(join(dir, "out.json"), "utf-8"));
		expect(out.endpoints.endpoints[0].explain).toMatch(EXPLAIN_HEAD);
	});

	it("attaches one boot text per trace to --format json", () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-json-"));
		outputSingleProjectResults(
			engineResult(),
			undefined,
			dir,
			{ ...options("json"), outputPath: join(dir, "out.json") },
			[],
			() => ({
				...EMPTY_ARTIFACT,
				graph: {
					...EMPTY_ARTIFACT.graph,
					startupMs: 40,
					timingsAvailable: true,
					timingsTrace: {
						ta: {
							deps: [],
							initTime: 40,
							name: "AppService",
							type: "provider",
						},
					},
				},
			})
		);
		const out = JSON.parse(readFileSync(join(dir, "out.json"), "utf-8"));
		expect(out.boot).toHaveLength(1);
		expect(out.boot[0].label).toBe("boot");
		expect(out.boot[0].explain).toMatch(BOOT_HEAD);
	});

	it("leaves --format json alone when no artifact builder is given", () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-json-"));
		outputSingleProjectResults(
			engineResult(),
			undefined,
			dir,
			{ ...options("json"), outputPath: join(dir, "out.json") },
			[]
		);
		expect(
			JSON.parse(readFileSync(join(dir, "out.json"), "utf-8"))
		).not.toHaveProperty("endpoints");
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
