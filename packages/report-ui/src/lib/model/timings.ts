export interface ClassTiming {
	id: string;
	initTime: number;
	name: string;
	type: string;
}

export interface HookTiming {
	count?: number;
	hook: string;
	ms: number;
}

export interface BootPhases {
	createMs?: number;
	initMs?: number;
	moduleInitMs?: number;
}

export interface TraceNode {
	deps: string[];
	hooks?: HookTiming[];
	initTime: number;
	name: string;
	type: string;
}
