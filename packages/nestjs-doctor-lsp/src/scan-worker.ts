import { createRequire } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
import { DiagnosticCache, isMissingAnalyzer } from "./diagnostic-cache.js";
import type {
	ServerMessage,
	WorkerData,
	WorkerMessage,
} from "./worker-protocol.js";

const { workspaceRoot } = workerData as WorkerData;

function post(msg: WorkerMessage) {
	parentPort?.postMessage(msg);
}

interface ScanContext {
	[key: string]: unknown;
}

interface ScanResult {
	diagnostics: unknown[];
	errors: unknown[];
}

interface NestjsDoctorApi {
	checkAllFiles(context: ScanContext): ScanResult;
	checkFile(context: ScanContext, filePath: string): ScanResult;
	checkProject(context: ScanContext): ScanResult;
	prepareAnalysis(
		path: string
	): Promise<{ context: ScanContext; customRuleWarnings: string[] }>;
	updateFile(context: ScanContext, filePath: string): void;
}

let ctx: ScanContext | null = null;
const fileDiagCache = new DiagnosticCache();

function handleFileChanged(api: NestjsDoctorApi, filePath: string) {
	if (!ctx) {
		return;
	}
	const start = performance.now();
	api.updateFile(ctx, filePath);
	const fileResult = api.checkFile(ctx, filePath);
	fileDiagCache.set(filePath, fileResult.diagnostics);
	const projectResult = api.checkProject(ctx);
	const elapsedMs = performance.now() - start;
	post({
		kind: "result",
		diagnostics: fileDiagCache.withProject(projectResult.diagnostics),
		elapsedMs,
		scanType: "incremental",
	});
}

function handleFullScan(api: NestjsDoctorApi) {
	if (!ctx) {
		return;
	}
	const start = performance.now();
	const fileResult = api.checkAllFiles(ctx);
	fileDiagCache.replaceAll(
		fileResult.diagnostics as Array<{ filePath?: string }>
	);
	const projectResult = api.checkProject(ctx);
	const elapsedMs = performance.now() - start;
	post({
		kind: "result",
		diagnostics: fileDiagCache.withProject(projectResult.diagnostics),
		elapsedMs,
		scanType: "full",
	});
}

async function initialize() {
	try {
		const require = createRequire(join(workspaceRoot, "package.json"));
		const api = require("nestjs-doctor") as NestjsDoctorApi;

		const { context } = await api.prepareAnalysis(workspaceRoot);
		ctx = context;

		post({ kind: "ready" });

		// Run initial full scan
		handleFullScan(api);

		// Listen for commands from the server
		parentPort?.on("message", (msg: ServerMessage) => {
			try {
				if (msg.kind === "fileChanged") {
					handleFileChanged(api, msg.filePath);
				} else if (msg.kind === "fullScan") {
					handleFullScan(api);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				post({ kind: "error", message });
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);

		if (isMissingAnalyzer(message)) {
			post({ kind: "missing" });
		} else {
			post({ kind: "error", message });
		}
	}
}

initialize();
