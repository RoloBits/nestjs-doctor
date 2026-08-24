import { parentPort, workerData } from "node:worker_threads";
import {
	MonorepoPipeline,
	type ScanWorkerMessage,
	type ScanWorkerRequest,
	SingleProjectPipeline,
} from "./pipeline.js";
import type { PipelineOptions } from "./setup.js";

const request = workerData as ScanWorkerRequest;

const post = (message: ScanWorkerMessage): void => {
	parentPort?.postMessage(message);
};

const options: PipelineOptions = {
	...request.options,
	interactive: false,
	isMachineReadable: true,
	skipOutput: true,
	onProgress: (label, done, total) => {
		post({ kind: "progress", label, done, total });
	},
};

try {
	const pipeline =
		request.kind === "monorepo" && request.monorepo
			? new MonorepoPipeline(request.targetPath, request.monorepo, options)
			: new SingleProjectPipeline(request.targetPath, options);

	await pipeline
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.applyScope()
		.warnCustomRules()
		.run();

	post({ kind: "outcome", outcome: pipeline.workerOutcome });
} catch (error) {
	post({
		kind: "error",
		message: error instanceof Error ? error.message : String(error),
	});
}
