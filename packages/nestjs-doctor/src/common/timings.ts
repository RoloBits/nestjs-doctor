/** One class's construction time during a captured bootstrap, in milliseconds. */
export interface ClassTiming {
	id: string;
	initTime: number;
	name: string;
	type: string;
}

/** One lifecycle hook's total duration for one class, in milliseconds. */
export interface HookTiming {
	/** Instance count from artifacts written before hooks stayed one per run. */
	count?: number;
	hook: string;
	ms: number;
	/** Offset from bootstrap start, when captured and the hook ran once. */
	startMs?: number;
}

/** Cumulative milliseconds from bootstrap start to the end of each phase. */
export interface BootPhases {
	createMs?: number;
	initMs?: number;
	moduleInitMs?: number;
}

/** One class in the boot trace: its timing plus the classes it injects. */
export interface TraceNode {
	deps: string[];
	hooks?: HookTiming[];
	initTime: number;
	/** Label of the dump module that owns the class; absent in older artifacts. */
	module?: string;
	name: string;
	type: string;
	/** Label of the one module importing the owning module, when it is not global. */
	via?: string;
}

export interface BootstrapTimings {
	byModule: Map<string, ClassTiming[]>;
	hooksByClass: Map<string, HookTiming[]>;
	phases?: BootPhases;
	startupMs?: number;
	trace: Record<string, TraceNode>;
}
