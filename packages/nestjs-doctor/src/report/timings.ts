import { readFileSync } from "node:fs";
import type {
	BootPhases,
	BootstrapTimings,
	ClassTiming,
	HookTiming,
	TraceNode,
} from "../common/timings.js";
import { resolveAgainst } from "../engine/git.js";

export type {
	BootstrapTimings,
	ClassTiming,
	HookTiming,
} from "../common/timings.js";

interface ParsedTimings {
	hooksByClass: Map<string, HookTiming[]>;
	modules: Map<string, ClassTiming[]>;
	phases?: BootPhases;
	startupMs?: number;
	trace: Record<string, TraceNode>;
	warnings: string[];
}

function asPositiveMs(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

interface DumpNode {
	label?: unknown;
	metadata?: {
		global?: unknown;
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
			hooksByClass: new Map(),
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
			hooksByClass: new Map(),
			modules: new Map(),
			trace: {},
			warnings: [
				'--timings: no "nodes" object found — expected a SerializedGraph dump from app.get(SerializedGraph); report generated without bootstrap timings',
			],
		};
	}

	const dumpNodes = nodes as Record<string, DumpNode>;
	const moduleLabels = new Map<string, string>();
	const moduleLabelCounts = new Map<string, number>();
	const globalModules = new Set<string>();
	// Counts class-node labels; hook entries only join to a unique label.
	// Module nodes are excluded: a module class also appears as a class node.
	const labelCounts = new Map<string, number>();
	for (const [id, node] of Object.entries(dumpNodes)) {
		const meta = node?.metadata;
		if (
			meta?.internal !== true &&
			meta?.type !== "module" &&
			typeof node?.label === "string"
		) {
			labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1);
		}
		if (
			meta?.type === "module" &&
			meta.internal !== true &&
			typeof node.label === "string"
		) {
			moduleLabels.set(id, node.label);
			if (meta.global === true) {
				globalModules.add(id);
			}
			moduleLabelCounts.set(
				node.label,
				(moduleLabelCounts.get(node.label) ?? 0) + 1
			);
		}
	}

	const rawEdges = (data as { edges?: unknown }).edges;
	const edges =
		typeof rawEdges === "object" && rawEdges !== null
			? Object.values(rawEdges as Record<string, DumpEdge>)
			: [];
	// Distinct importing module ids per module id; only module nodes count.
	const importersByModule = new Map<string, Set<string>>();
	for (const edge of edges) {
		if (edge?.metadata?.type !== "module-to-module") {
			continue;
		}
		const { source, target } = edge;
		if (
			typeof source !== "string" ||
			typeof target !== "string" ||
			source === target ||
			!moduleLabels.has(source)
		) {
			continue;
		}
		const importers = importersByModule.get(target) ?? new Set<string>();
		importers.add(source);
		importersByModule.set(target, importers);
	}
	// A global module is reachable from everywhere, so its importer says nothing.
	const viaOf = (moduleId: string): string | undefined => {
		const importers = importersByModule.get(moduleId);
		if (globalModules.has(moduleId) || importers?.size !== 1) {
			return undefined;
		}
		return moduleLabels.get([...importers][0] as string);
	};

	const modules = new Map<string, ClassTiming[]>();
	// Ids get a "t" prefix so an id like "__proto__" stays a plain object key.
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
		const via = viaOf(node.parent);
		trace[id] = {
			name: node.label,
			type,
			initTime,
			deps: [],
			module: moduleName,
			...(via ? { via } : {}),
		};
		// Two dump modules sharing a name would merge their class lists; skip both.
		if (moduleLabelCounts.get(moduleName) !== 1) {
			continue;
		}
		const list = modules.get(moduleName) ?? [];
		list.push({ id, name: node.label, type, initTime });
		modules.set(moduleName, list);
	}

	for (const edge of edges) {
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

	for (const node of Object.values(trace)) {
		node.deps.sort((a, b) => trace[b].initTime - trace[a].initTime);
	}
	for (const list of modules.values()) {
		list.sort((a, b) => b.initTime - a.initTime);
	}

	const warnings: string[] = [];
	if (Object.keys(trace).length === 0) {
		warnings.push(
			"--timings: no class init times found in the dump — was it produced with NestFactory.create(AppModule, { snapshot: true })?"
		);
	}

	const hooksByClass = new Map<string, HookTiming[]>();
	const rawHooks = (data as { hookTimings?: unknown }).hookTimings;
	if (Array.isArray(rawHooks)) {
		let malformed = 0;
		let ambiguous = 0;
		for (const entry of rawHooks as Record<string, unknown>[]) {
			const className = entry?.className;
			const hook = entry?.hook;
			const ms = entry?.ms;
			const startMs = entry?.startMs;
			if (
				typeof className !== "string" ||
				typeof hook !== "string" ||
				typeof ms !== "number" ||
				!Number.isFinite(ms) ||
				ms < 0
			) {
				malformed++;
				continue;
			}
			if (ms === 0) {
				continue;
			}
			if (labelCounts.get(className) !== 1) {
				ambiguous++;
				continue;
			}
			const list = hooksByClass.get(className) ?? [];
			// Transient providers report once per instance; merged into one total
			// with no offset.
			const existing = list.find((h) => h.hook === hook);
			if (existing) {
				existing.ms += ms;
				existing.count = (existing.count ?? 1) + 1;
				existing.startMs = undefined;
			} else {
				list.push({
					hook,
					ms,
					...(typeof startMs === "number" &&
					Number.isFinite(startMs) &&
					startMs >= 0
						? { startMs }
						: {}),
				});
			}
			hooksByClass.set(className, list);
		}
		if (malformed > 0) {
			warnings.push(
				`--timings: ${malformed} hookTimings entries are malformed and were ignored`
			);
		}
		if (ambiguous > 0) {
			warnings.push(
				`--timings: ${ambiguous} hook timings name classes that are missing or appear more than once in the dump; they are not attached`
			);
		}
	}
	for (const node of Object.values(trace)) {
		const hooks = hooksByClass.get(node.name);
		if (hooks) {
			node.hooks = hooks;
		}
	}

	const startupMs = asPositiveMs((data as { startupMs?: unknown }).startupMs);
	const createMs = asPositiveMs((data as { createMs?: unknown }).createMs);
	const moduleInitMs = asPositiveMs(
		(data as { moduleInitMs?: unknown }).moduleInitMs
	);
	const initMs = asPositiveMs((data as { initMs?: unknown }).initMs);
	const markers = [createMs, moduleInitMs, initMs, startupMs].filter(
		(m): m is number => m !== undefined
	);
	const monotonic = markers.every((m, i) => i === 0 || m >= markers[i - 1]);
	let phases: BootPhases | undefined;
	if (!monotonic) {
		warnings.push(
			"--timings: phase markers are out of order; report generated without the phase breakdown"
		);
	} else if (
		createMs !== undefined ||
		moduleInitMs !== undefined ||
		initMs !== undefined
	) {
		phases = { createMs, initMs, moduleInitMs };
	}
	return { hooksByClass, modules, phases, startupMs, trace, warnings };
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
	const { hooksByClass, modules, phases, startupMs, trace, warnings } =
		parseBootstrapTimings(raw);
	return Object.keys(trace).length > 0 ||
		startupMs !== undefined ||
		phases !== undefined
		? {
				timings: { byModule: modules, hooksByClass, phases, startupMs, trace },
				warnings,
			}
		: { warnings };
}
