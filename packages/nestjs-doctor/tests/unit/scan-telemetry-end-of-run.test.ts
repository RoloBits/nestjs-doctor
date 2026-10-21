import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SingleProjectPipeline } from "../../src/cli/pipeline.js";
import {
	reportScanTelemetry,
	type ScanTelemetryInput,
} from "../../src/cli/scan-telemetry-reporter.js";
import type { EndOfRun, PipelineOptions } from "../../src/cli/setup.js";
import type { ScanWorkerRequest } from "../../src/cli/worker-delegate.js";

vi.mock("../../src/cli/scan-telemetry-reporter.js", () => ({
	reportScanTelemetry: vi.fn(),
}));

const FIXTURE = resolve(import.meta.dirname, "../fixtures/basic-app");

/** No output and no spinner; the end-of-run decision is handed in. */
const options = (endOfRun: EndOfRun): PipelineOptions => ({
	base: undefined,
	blocking: "none",
	changedFilesFrom: undefined,
	configPath: undefined,
	endOfRun,
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
	sources: "none",
	staged: false,
	telemetry: false,
	verbose: false,
});

const reported = async (
	endOfRun: EndOfRun
): Promise<Pick<ScanTelemetryInput, "hintShown" | "tty">> => {
	await new SingleProjectPipeline(FIXTURE, options(endOfRun))
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.applyScope()
		.run();
	const input = vi.mocked(reportScanTelemetry).mock.calls.at(-1)?.[0];
	return { hintShown: input?.hintShown, tty: input?.tty } as Pick<
		ScanTelemetryInput,
		"hintShown" | "tty"
	>;
};

/** Captures the worker request instead of spawning a thread. */
class CapturingPipeline extends SingleProjectPipeline {
	request: ScanWorkerRequest | undefined;

	protected runViaWorker(request: ScanWorkerRequest): Promise<void> {
		this.request = request;
		return Promise.resolve();
	}

	sendToWorker(): Promise<void> {
		return this.delegate();
	}
}

describe("end-of-run facts on scan_completed", () => {
	beforeEach(() => {
		vi.mocked(reportScanTelemetry).mockClear();
	});

	it("reports the hint as shown on the scan that will print it", async () => {
		expect(await reported({ triggerSite: "run", tty: true })).toEqual({
			hintShown: true,
			tty: true,
		});
		expect(await reported({ triggerSite: "menu", tty: true })).toEqual({
			hintShown: true,
			tty: true,
		});
	}, 60_000);

	it("reports the hint as not shown when it prints nowhere", async () => {
		expect(await reported({ triggerSite: "none", tty: false })).toEqual({
			hintShown: false,
			tty: false,
		});
	}, 60_000);

	it("hands main's decision to the worker", async () => {
		const endOfRun: EndOfRun = { triggerSite: "menu", tty: true };
		const pipeline = new CapturingPipeline(FIXTURE, options(endOfRun));
		await pipeline.sendToWorker();

		expect(pipeline.request?.endOfRun).toEqual(endOfRun);
	}, 60_000);
});
