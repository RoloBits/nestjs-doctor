export interface WorkerData {
	workspaceRoot: string;
}

// Server → Worker
export type ServerMessage =
	| { kind: "fullScan" }
	| { kind: "fileChanged"; filePath: string };

// Worker → Server
export type WorkerMessage =
	| { kind: "ready" }
	| {
			kind: "result";
			diagnostics: unknown[];
			elapsedMs: number;
			scanType: string;
	  }
	| { kind: "error"; message: string }
	| { kind: "missing" };
