import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type PipelineOptions, toScanOptions } from "../../src/cli/setup.js";
import type { BootstrapTimings } from "../../src/common/timings.js";

const timings: BootstrapTimings = {
	byModule: new Map([
		[
			"AppModule",
			[{ id: "app", initTime: 3, name: "AppModule", type: "module" }],
		],
	]),
	hooksByClass: new Map([["AppModule", [{ hook: "onModuleInit", ms: 5 }]]]),
	phases: { initMs: 9 },
	startupMs: 12,
	trace: {
		AppModule: { deps: [], initTime: 3, name: "AppModule", type: "module" },
	},
};

const options = (over: Partial<PipelineOptions> = {}): PipelineOptions => ({
	base: "main",
	blocking: "error",
	changedFilesFrom: "origin/main",
	configPath: "nestjs-doctor.config.ts",
	format: "report-json",
	interactive: true,
	isMachineReadable: false,
	jsonCompact: true,
	minScore: "80",
	onProgress: (label) => label.length > 0,
	outputPath: "out/report.json",
	scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
	scope: "changed",
	score: true,
	skipOutput: false,
	sources: "touched",
	staged: true,
	telemetry: false,
	timings,
	verbose: true,
	...over,
});

describe("toScanOptions", () => {
	const scan = toScanOptions(options());

	it("carries every engine field through with the source value", () => {
		expect(scan).toStrictEqual({
			base: "main",
			blocking: "error",
			changedFilesFrom: "origin/main",
			configPath: "nestjs-doctor.config.ts",
			format: "report-json",
			minScore: "80",
			scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
			scope: "changed",
			staged: true,
			telemetry: false,
		});
	});

	it("carries the output format through toScanOptions", () => {
		expect(toScanOptions(options({ format: "sarif" })).format).toBe("sarif");
	});

	it("carries the scan id through toScanOptions", () => {
		// The worker builds its own options, so an id left behind here is
		// undefined for every interactive scan.
		expect(toScanOptions(options({ scanId: "worker-visible-id" })).scanId).toBe(
			"worker-visible-id"
		);
	});

	it("is JSON-safe: no functions and a lossless round-trip", () => {
		for (const value of Object.values(scan)) {
			expect(typeof value).not.toBe("function");
		}
		expect(JSON.parse(JSON.stringify(scan))).toStrictEqual(scan);
	});

	it("drops presentation fields", () => {
		for (const key of [
			"interactive",
			"isMachineReadable",
			"jsonCompact",
			"onProgress",
			"outputPath",
			"score",
			"skipOutput",
			"sources",
			"timings",
			"verbose",
		]) {
			expect(scan).not.toHaveProperty(key);
		}
	});
});

describe("scan worker options", () => {
	const source = readFileSync(
		new URL("../../src/cli/scan-worker.ts", import.meta.url),
		"utf8"
	);

	it("takes the output format from the request, not a constant", () => {
		expect(source).toContain("...request.options,");
		expect(source).not.toContain("format:");
	});

	it("still prints nothing and reports machine-readable", () => {
		expect(source).toContain("isMachineReadable: true,");
		expect(source).toContain("skipOutput: true,");
	});
});
