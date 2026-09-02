import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	MonorepoPipeline,
	SingleProjectPipeline,
} from "../../src/cli/pipeline.js";
import type { PipelineOptions } from "../../src/cli/setup.js";
import { detectMonorepo } from "../../src/engine/project-detector.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

/** A scan with every output and the spinner suppressed, telemetry declined. */
const declinedOptions = (): PipelineOptions => ({
	base: undefined,
	blocking: "none",
	changedFilesFrom: undefined,
	configPath: undefined,
	format: "console",
	interactive: false,
	isMachineReadable: true,
	jsonCompact: false,
	minScore: undefined,
	outputPath: undefined,
	scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
	scope: "full",
	score: false,
	shareCode: false,
	shareSections: undefined,
	skipOutput: true,
	sources: "all",
	staged: false,
	telemetry: false,
	verbose: false,
});

const BEACON_MARKERS = ["posthog", "report_opened", "window.__ndTrack ="];

describe("interactive report telemetry", () => {
	it("omits the beacon from a single-project menu report under --no-telemetry", async () => {
		const pipeline = new SingleProjectPipeline(
			resolve(FIXTURES, "basic-app"),
			declinedOptions()
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.applyScope()
			.output()
			.run();

		const html = pipeline.interactiveArtifacts.buildReportHtml();
		expect(html).toContain("<html");
		for (const marker of BEACON_MARKERS) {
			expect(html).not.toContain(marker);
		}
	});

	it("omits the beacon from a monorepo menu report under --no-telemetry", async () => {
		const targetPath = resolve(FIXTURES, "monorepo-app");
		const monorepo = await detectMonorepo(targetPath);
		if (!monorepo) {
			throw new Error("monorepo-app fixture was not detected as a monorepo");
		}
		const pipeline = new MonorepoPipeline(
			targetPath,
			monorepo,
			declinedOptions()
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.applyScope()
			.output()
			.run();

		const html = pipeline.interactiveArtifacts.buildReportHtml();
		expect(html).toContain("<html");
		for (const marker of BEACON_MARKERS) {
			expect(html).not.toContain(marker);
		}
	});
});
