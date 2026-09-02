import { stat } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import type { ReportProvider } from "../common/artifact.js";
import type { DiagnoseResult } from "../common/result.js";
import type { MonorepoInfo } from "../engine/project-detector.js";
import type { EngineResult, MonorepoEngineResult } from "../engine/scanner.js";
import type { ScanOptions } from "./setup.js";

/** Main → scan worker. Everything the engine middle needs. */
export interface ScanWorkerRequest {
	kind: "monorepo" | "single";
	monorepo?: MonorepoInfo;
	options: ScanOptions;
	targetPath: string;
	version: string;
}

/** Worker → main. Progress ticks, then one outcome or one failure. */
export type ScanWorkerMessage =
	| { kind: "progress"; label: string; done?: number; total?: number }
	| { kind: "outcome"; outcome: ScanOutcome }
	| { kind: "error"; message: string };

/** Everything the engine steps produced, in transferable data. */
export type ScanOutcome =
	| {
			kind: "monorepo";
			customRuleWarnings: string[];
			moduleGraphs: MonorepoEngineResult["moduleGraphs"];
			result: MonorepoEngineResult["result"];
			reportProviders: ReportProvider[];
			bootstrapRoots: string[];
			allFiles: string[];
			subProjectOptOut: boolean;
			reportTelemetry: boolean;
			scopeWarnings: string[];
			resolvedMinimumScore?: number;
	  }
	| {
			kind: "single";
			customRuleWarnings: string[];
			files: string[];
			moduleGraph: EngineResult["moduleGraph"];
			reportProviders: ReportProvider[];
			bootstrapRoots: string[];
			result: DiagnoseResult;
			reportTelemetry: boolean;
			schemaGraph: EngineResult["schemaGraph"];
			scopeWarnings: string[];
			resolvedMinimumScore?: number;
	  };

/** The parts of a worker thread the delegate wiring touches. */
export interface WorkerLike {
	on(event: "error", listener: (error: Error) => void): unknown;
	on(event: "exit", listener: (code: number) => void): unknown;
	on(event: "message", listener: (message: ScanWorkerMessage) => void): unknown;
	terminate(): Promise<number>;
}

/** Location of the scan worker entry, injected by the CLI. */
let workerUrl: URL | null = null;

export const setWorkerUrl = (url: URL | null): void => {
	workerUrl = url;
};

export interface CanDelegateInput {
	hasOutputStep: boolean;
	interactive: boolean;
	isMachineReadable: boolean;
	/** Injectable for tests; defaults to fs stat on the worker entry. */
	statFile?: typeof stat;
}

export const canDelegateToWorker = async (
	input: CanDelegateInput
): Promise<boolean> => {
	if (!input.interactive || input.isMachineReadable) {
		return false;
	}
	if (!input.hasOutputStep || workerUrl === null) {
		return false;
	}
	try {
		await (input.statFile ?? stat)(workerUrl);
		return true;
	} catch {
		return false;
	}
};

interface RunInWorkerDeps {
	/** Injectable for tests; defaults to a real worker thread. */
	createWorker?: (url: URL, request: ScanWorkerRequest) => WorkerLike;
	emitProgress(label: string, done?: number, total?: number): void;
}

export const runInWorker = (
	request: ScanWorkerRequest,
	apply: (outcome: ScanOutcome) => void,
	deps: RunInWorkerDeps
): Promise<void> =>
	new Promise((resolve, reject) => {
		const url = workerUrl;
		if (!url) {
			reject(new Error("scan worker is not available"));
			return;
		}
		let settled = false;
		const createWorker =
			deps.createWorker ??
			((entryUrl: URL, entryRequest: ScanWorkerRequest) =>
				new Worker(entryUrl, { workerData: entryRequest }) as WorkerLike);
		const thread = createWorker(url, request);
		const finish = (error?: Error): void => {
			if (settled) {
				return;
			}
			settled = true;
			// biome-ignore lint/suspicious/noEmptyBlockStatements: termination is best-effort once the promise is settled
			thread.terminate().catch(() => {});
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		};
		thread.on("message", (message: ScanWorkerMessage) => {
			if (message.kind === "progress") {
				deps.emitProgress(message.label, message.done, message.total);
			} else if (message.kind === "outcome") {
				try {
					apply(message.outcome);
				} catch (error) {
					finish(error instanceof Error ? error : new Error(String(error)));
					return;
				}
				finish();
			} else {
				finish(new Error(message.message));
			}
		});
		thread.on("error", (error) => {
			finish(error instanceof Error ? error : new Error(String(error)));
		});
		thread.on("exit", (code) => {
			if (code !== 0) {
				finish(new Error(`scan worker exited with code ${code}`));
			}
		});
	});
