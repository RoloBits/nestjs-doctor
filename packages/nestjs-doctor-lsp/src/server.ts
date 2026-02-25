import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import {
	type Connection,
	createConnection,
	type InitializeParams,
	type InitializeResult,
	type Diagnostic as LspDiagnostic,
	ProposedFeatures,
	TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { groupByFile } from "./convert.js";
import type {
	ServerMessage,
	WorkerData,
	WorkerMessage,
} from "./worker-protocol.js";

interface Settings {
	debounceMs: number;
	enable: boolean;
	scanOnOpen: boolean;
	scanOnSave: boolean;
}

const defaultSettings: Settings = {
	debounceMs: 200,
	enable: true,
	scanOnOpen: true,
	scanOnSave: true,
};

const connection: Connection = createConnection(ProposedFeatures.all);

let workspaceRoot = "";
let settings: Settings = { ...defaultSettings };
let cache = new Map<string, LspDiagnostic[]>();
let activeWorker: Worker | null = null;
let workerReady = false;
let pendingMessages: ServerMessage[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let saveReceivedAt = 0;

function diagnosticsEqual(a: LspDiagnostic[], b: LspDiagnostic[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		const da = a[i];
		const db = b[i];
		if (
			da.code !== db.code ||
			da.message !== db.message ||
			da.severity !== db.severity ||
			da.range.start.line !== db.range.start.line ||
			da.range.start.character !== db.range.start.character
		) {
			return false;
		}
	}
	return true;
}

function publishDiagnostics(grouped: Map<string, LspDiagnostic[]>) {
	for (const uri of cache.keys()) {
		if (!grouped.has(uri)) {
			connection.sendDiagnostics({ uri, diagnostics: [] });
		}
	}

	for (const [uri, diagnostics] of grouped) {
		const cached = cache.get(uri);
		if (cached && diagnosticsEqual(cached, diagnostics)) {
			continue;
		}
		connection.sendDiagnostics({ uri, diagnostics });
	}

	cache = grouped;
}

function sendToWorker(msg: ServerMessage) {
	if (!activeWorker) {
		return;
	}
	if (!workerReady) {
		pendingMessages.push(msg);
		return;
	}
	activeWorker.postMessage(msg);
}

function flushPendingMessages() {
	for (const msg of pendingMessages) {
		activeWorker?.postMessage(msg);
	}
	pendingMessages = [];
}

function spawnWorker() {
	if (activeWorker) {
		return;
	}

	workerReady = false;
	pendingMessages = [];

	const workerData: WorkerData = { workspaceRoot };
	const worker = new Worker(join(import.meta.dirname, "scan-worker.cjs"), {
		workerData,
	});
	activeWorker = worker;

	worker.on("message", (msg: WorkerMessage) => {
		if (msg.kind === "ready") {
			workerReady = true;
			flushPendingMessages();
		} else if (msg.kind === "result") {
			const grouped = groupByFile(
				msg.diagnostics as Parameters<typeof groupByFile>[0],
				workspaceRoot
			);
			publishDiagnostics(grouped);

			if (saveReceivedAt > 0) {
				const e2eMs = performance.now() - saveReceivedAt;
				saveReceivedAt = 0;
				connection.console.log(
					`NestJS Doctor ${msg.scanType} scan completed in ${msg.elapsedMs.toFixed(0)}ms (${e2eMs.toFixed(0)}ms end-to-end)`
				);
			} else {
				connection.console.log(
					`NestJS Doctor ${msg.scanType} scan completed in ${msg.elapsedMs.toFixed(0)}ms`
				);
			}
		} else if (msg.kind === "error") {
			connection.window.showErrorMessage(
				`NestJS Doctor scan failed: ${msg.message}`
			);
		} else if (msg.kind === "missing") {
			connection.window.showWarningMessage(
				"nestjs-doctor is not installed in this workspace. Run: npm install nestjs-doctor"
			);
			terminateWorker();
		}
	});

	worker.on("error", (err) => {
		connection.window.showErrorMessage(
			`NestJS Doctor worker error: ${err.message}`
		);
		terminateWorker();
	});

	worker.on("exit", () => {
		if (activeWorker === worker) {
			activeWorker = null;
			workerReady = false;
		}
	});
}

function terminateWorker() {
	if (activeWorker) {
		activeWorker.terminate();
		activeWorker = null;
		workerReady = false;
		pendingMessages = [];
	}
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
	if (params.rootUri) {
		workspaceRoot = fileURLToPath(params.rootUri);
	} else if (params.rootPath) {
		workspaceRoot = params.rootPath;
	}

	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
		},
	};
});

connection.onInitialized(async () => {
	try {
		const raw = await connection.workspace.getConfiguration("nestjsDoctor");
		if (raw && typeof raw === "object") {
			settings = { ...defaultSettings, ...(raw as Partial<Settings>) };
		}
	} catch {
		// Workspace configuration may not be supported; keep defaults
	}

	if (settings.enable && settings.scanOnOpen) {
		spawnWorker();
	}
});

connection.onDidSaveTextDocument((params) => {
	if (!settings.scanOnSave) {
		return;
	}
	if (!params.textDocument.uri.endsWith(".ts")) {
		return;
	}

	saveReceivedAt = performance.now();
	const filePath = fileURLToPath(params.textDocument.uri);

	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	debounceTimer = setTimeout(() => {
		sendToWorker({ kind: "fileChanged", filePath });
	}, settings.debounceMs);
});

connection.onRequest("nestjs-doctor/scan", () => {
	if (activeWorker) {
		sendToWorker({ kind: "fullScan" });
	} else {
		spawnWorker();
	}
	return {};
});

connection.listen();
