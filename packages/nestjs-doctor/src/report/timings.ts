import { readFileSync } from "node:fs";
import { resolveAgainst } from "../engine/git.js";

/** One class's construction time during a captured bootstrap, in milliseconds. */
export interface ClassTiming {
	initTime: number;
	name: string;
	type: string;
}

interface ParsedTimings {
	modules: Map<string, ClassTiming[]>;
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

/** Parses a NestJS SerializedGraph dump into per-module class timings, slowest first. */
export function parseBootstrapTimings(jsonText: string): ParsedTimings {
	let data: unknown;
	try {
		data = JSON.parse(jsonText);
	} catch {
		return {
			modules: new Map(),
			warnings: [
				"--timings: file is not valid JSON; report generated without bootstrap timings",
			],
		};
	}

	const nodes = (data as { nodes?: unknown } | null)?.nodes;
	if (typeof nodes !== "object" || nodes === null) {
		return {
			modules: new Map(),
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
	for (const node of Object.values(dumpNodes)) {
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
		const list = modules.get(moduleName) ?? [];
		list.push({
			name: node.label,
			type: typeof meta.type === "string" ? meta.type : "provider",
			initTime,
		});
		modules.set(moduleName, list);
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
	return { modules, warnings };
}

/** Reads and parses a timings dump; any failure degrades to a warning, never a crash. */
export function loadBootstrapTimings(
	targetPath: string,
	timingsPath: string
): { timings?: Map<string, ClassTiming[]>; warnings: string[] } {
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
	const { modules, warnings } = parseBootstrapTimings(raw);
	return modules.size > 0 ? { timings: modules, warnings } : { warnings };
}
