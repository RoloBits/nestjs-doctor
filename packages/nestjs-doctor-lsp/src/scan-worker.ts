import { createRequire } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
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
	prepareScan(
		path: string
	): Promise<{ context: ScanContext; customRuleWarnings: string[] }>;
	scanAllFiles(context: ScanContext): ScanResult;
	scanFile(context: ScanContext, filePath: string): ScanResult;
	scanProject(context: ScanContext): ScanResult;
	updateFile(context: ScanContext, filePath: string): void;
}

let ctx: ScanContext | null = null;
const fileDiagCache = new Map<string, unknown[]>();

function collectAllDiagnostics(projectDiagnostics: unknown[]): unknown[] {
	const all: unknown[] = [];
	for (const diags of fileDiagCache.values()) {
		all.push(...diags);
	}
	all.push(...projectDiagnostics);
	return all;
}

function handleFileChanged(api: NestjsDoctorApi, filePath: string) {
	if (!ctx) {
		return;
	}
	const start = performance.now();
	api.updateFile(ctx, filePath);
	const fileResult = api.scanFile(ctx, filePath);
	fileDiagCache.set(filePath, fileResult.diagnostics);
	const projectResult = api.scanProject(ctx);
	const elapsedMs = performance.now() - start;
	post({
		kind: "result",
		diagnostics: collectAllDiagnostics(projectResult.diagnostics),
		elapsedMs,
		scanType: "incremental",
	});
}

function handleFullScan(api: NestjsDoctorApi) {
	if (!ctx) {
		return;
	}
	const start = performance.now();
	const fileResult = api.scanAllFiles(ctx);
	fileDiagCache.clear();
	for (const d of fileResult.diagnostics as Array<{ filePath?: string }>) {
		const key = d.filePath ?? "";
		let list = fileDiagCache.get(key);
		if (!list) {
			list = [];
			fileDiagCache.set(key, list);
		}
		list.push(d);
	}
	const projectResult = api.scanProject(ctx);
	const elapsedMs = performance.now() - start;
	post({
		kind: "result",
		diagnostics: collectAllDiagnostics(projectResult.diagnostics),
		elapsedMs,
		scanType: "full",
	});
}

async function initialize() {
	try {
		const require = createRequire(join(workspaceRoot, "package.json"));
		const api = require("nestjs-doctor") as NestjsDoctorApi;

		const { context } = await api.prepareScan(workspaceRoot);
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

		if (message.includes("Cannot find module 'nestjs-doctor'")) {
			post({ kind: "missing" });
		} else {
			post({ kind: "error", message });
		}
	}
}

initialize();
