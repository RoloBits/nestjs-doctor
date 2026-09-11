import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	MonorepoPipeline,
	SingleProjectPipeline,
} from "../../src/cli/pipeline.js";
import type { PipelineOptions } from "../../src/cli/setup.js";
import type {
	ScanOutcome,
	ScanWorkerRequest,
} from "../../src/cli/worker-delegate.js";
import { decodeCodeGraph } from "../../src/common/code-graph-codec.js";
import { detectMonorepo } from "../../src/engine/project-detector.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/cg-codec");
const MONO = resolve(import.meta.dirname, "../fixtures/cg-mono");

/** What the scan worker builds: no output, no spinner, no telemetry. */
const workerOptions = (wantsCodeGraph: boolean): PipelineOptions => ({
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
	sources: "none",
	staged: false,
	telemetry: false,
	verbose: false,
	wantsCodeGraph,
});

/** The main thread's side of a delegated scan: interactive, menu to follow. */
const menuOptions = (): PipelineOptions => ({
	...workerOptions(false),
	interactive: true,
	isMachineReadable: false,
	wantsCodeGraph: undefined,
});

const scanSingle = async (
	wantsCodeGraph: boolean
): Promise<SingleProjectPipeline> => {
	const pipeline = new SingleProjectPipeline(
		FIXTURE,
		workerOptions(wantsCodeGraph)
	);
	await pipeline
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.applyScope()
		.run();
	return pipeline;
};

/** Replays one worker outcome on the main side without spawning a thread. */
class FakeWorkerPipeline extends SingleProjectPipeline {
	constructor(
		targetPath: string,
		options: PipelineOptions,
		private readonly outcome: ScanOutcome
	) {
		super(targetPath, options);
	}

	protected canDelegate(): Promise<boolean> {
		return Promise.resolve(true);
	}

	protected runViaWorker(
		_request: ScanWorkerRequest,
		apply: (outcome: ScanOutcome) => void
	): Promise<void> {
		apply(this.outcome);
		return Promise.resolve();
	}
}

const replay = async (outcome: ScanOutcome): Promise<FakeWorkerPipeline> => {
	const pipeline = new FakeWorkerPipeline(FIXTURE, menuOptions(), outcome);
	await pipeline.run();
	return pipeline;
};

describe("scan worker code graph", () => {
	it("captures the code graph when the request asks for it", async () => {
		const pipeline = await scanSingle(true);

		const encoded = pipeline.workerOutcome.codeGraph;
		expect(encoded).toBeDefined();
		expect(decodeCodeGraph(encoded!).entries).toHaveLength(2);
	}, 60_000);

	it("leaves the code graph out when the request does not ask", async () => {
		const pipeline = await scanSingle(false);

		expect(pipeline.workerOutcome.codeGraph).toBeUndefined();
	}, 60_000);

	it("captures the merged graph of a monorepo scan", async () => {
		const monorepo = await detectMonorepo(MONO);
		if (!monorepo) {
			throw new Error("cg-mono fixture was not detected as a monorepo");
		}
		const pipeline = new MonorepoPipeline(MONO, monorepo, workerOptions(true));
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.applyScope()
			.run();

		const encoded = pipeline.workerOutcome.codeGraph;
		expect(encoded).toBeDefined();
		expect(decodeCodeGraph(encoded!).entries.length).toBeGreaterThan(0);
	}, 60_000);

	it("puts the worker's graph into the report artifact", async () => {
		const outcome = (await scanSingle(true)).workerOutcome;

		const pipeline = await replay(outcome);

		const encoded = pipeline.reportArtifact.codeGraph;
		expect(encoded).toBeDefined();
		expect(decodeCodeGraph(encoded!).entries).toHaveLength(2);
	}, 60_000);

	it("builds no code graph when the worker sent none", async () => {
		const outcome = (await scanSingle(false)).workerOutcome;

		const pipeline = await replay(outcome);

		expect(pipeline.reportArtifact.codeGraph).toBeUndefined();
	}, 60_000);
});
