import { readFileSync } from "node:fs";
import { resolveAgainst } from "../engine/git.js";

/** One class's construction time during a captured bootstrap, in milliseconds. */
export interface ClassTiming {
	id: string;
	initTime: number;
	name: string;
	type: string;
}

/** One class in the boot trace: its timing plus the classes it injects. */
export interface TraceNode {
	deps: string[];
	initTime: number;
	name: string;
	type: string;
}

export interface BootstrapTimings {
	byModule: Map<string, ClassTiming[]>;
	startupMs?: number;
	trace: Record<string, TraceNode>;
}

interface ParsedTimings {
	modules: Map<string, ClassTiming[]>;
	startupMs?: number;
	trace: Record<string, TraceNode>;
	warnings: string[];
}

interface DumpNode {
	label?: unknown;
	metadata?: {
		initTime?: unknown;
		internal?: unknown;
		type?: unknown;
	};
	parent?: unknown;
}

interface DumpEdge {
	metadata?: { type?: unknown };
	source?: unknown;
	target?: unknown;
}

/** Parses a NestJS SerializedGraph dump into per-module class timings, slowest first. */
export function parseBootstrapTimings(jsonText: string): ParsedTimings {
	let data: unknown;
	try {
		data = JSON.parse(jsonText);
	} catch {
		return {
			modules: new Map(),
			trace: {},
			warnings: [
				"--timings: file is not valid JSON; report generated without bootstrap timings",
			],
		};
	}

	const nodes = (data as { nodes?: unknown } | null)?.nodes;
	if (typeof nodes !== "object" || nodes === null) {
		return {
			modules: new Map(),
			trace: {},
			warnings: [
				'--timings: no "nodes" object found — expected a SerializedGraph dump from app.get(SerializedGraph); report generated without bootstrap timings',
			],
		};
	}

	const dumpNodes = nodes as Record<string, DumpNode>;
	const moduleLabels = new Map<string, string>();
	for (const [id, node] of Object.entries(dumpNodes)) {
		const meta = node?.metadata;
		if (
			meta?.type === "module" &&
			meta.internal !== true &&
			typeof node.label === "string"
		) {
			moduleLabels.set(id, node.label);
		}
	}

	const modules = new Map<string, ClassTiming[]>();
	// Ids are prefixed: the graph is embedded as an object literal, where a bare
	// "__proto__" key would act as a prototype setter instead of a data key.
	const trace: Record<string, TraceNode> = {};
	for (const [rawId, node] of Object.entries(dumpNodes)) {
		const meta = node?.metadata;
		if (!meta || meta.type === "module" || meta.internal === true) {
			continue;
		}
		const { initTime } = meta;
		if (
			typeof initTime !== "number" ||
			!Number.isFinite(initTime) ||
			initTime < 0
		) {
			continue;
		}
		if (typeof node.parent !== "string" || typeof node.label !== "string") {
			continue;
		}
		const moduleName = moduleLabels.get(node.parent);
		if (!moduleName) {
			continue;
		}
		const type = typeof meta.type === "string" ? meta.type : "provider";
		const id = `t${rawId}`;
		const list = modules.get(moduleName) ?? [];
		list.push({ id, name: node.label, type, initTime });
		modules.set(moduleName, list);
		trace[id] = { name: node.label, type, initTime, deps: [] };
	}

	const edges = (data as { edges?: unknown }).edges;
	if (typeof edges === "object" && edges !== null) {
		for (const edge of Object.values(edges as Record<string, DumpEdge>)) {
			if (edge?.metadata?.type !== "class-to-class") {
				continue;
			}
			const { source, target } = edge;
			if (typeof source !== "string" || typeof target !== "string") {
				continue;
			}
			const from = Object.hasOwn(trace, `t${source}`)
				? trace[`t${source}`]
				: undefined;
			const to = `t${target}`;
			if (from && Object.hasOwn(trace, to) && !from.deps.includes(to)) {
				from.deps.push(to);
			}
		}
	}

	for (const node of Object.values(trace)) {
		node.deps.sort((a, b) => trace[b].initTime - trace[a].initTime);
	}
	for (const list of modules.values()) {
		list.sort((a, b) => b.initTime - a.initTime);
	}

	const warnings: string[] = [];
	if (modules.size === 0) {
		warnings.push(
			"--timings: no class init times found in the dump — was it produced with NestFactory.create(AppModule, { snapshot: true })?"
		);
	}

	const rawStartup = (data as { startupMs?: unknown }).startupMs;
	const startupMs =
		typeof rawStartup === "number" &&
		Number.isFinite(rawStartup) &&
		rawStartup > 0
			? rawStartup
			: undefined;
	return { modules, startupMs, trace, warnings };
}

/** Reads and parses a timings dump; any failure degrades to a warning, never a crash. */
export function loadBootstrapTimings(
	targetPath: string,
	timingsPath: string
): { timings?: BootstrapTimings; warnings: string[] } {
	let raw: string;
	try {
		raw = readFileSync(resolveAgainst(targetPath, timingsPath), "utf-8");
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return {
			warnings: [
				`--timings: could not read ${timingsPath} (${reason}); report generated without bootstrap timings`,
			],
		};
	}
	const { modules, startupMs, trace, warnings } = parseBootstrapTimings(raw);
	return modules.size > 0
		? { timings: { byModule: modules, startupMs, trace }, warnings }
		: { warnings };
}
