import type { Diagnostic } from "../../common/diagnostic.js";
import type { SerializedModuleGraph } from "../formatters/module-serializer.js";

/** Monorepo combined views carry no readable sources. */
export function isMonorepoPayload(
	fileSources: Record<string, string>
): boolean {
	return Object.keys(fileSources).length === 0;
}

const UNUSED_PROVIDER_NAME = /Provider '([^']+)'/;

/** Provider names flagged by performance/no-unused-providers, keyed for lookup. */
export function collectUnusedProviders(diagnostics: Diagnostic[]): Set<string> {
	const names = new Set<string>();
	for (const diagnostic of diagnostics) {
		if (diagnostic.rule !== "performance/no-unused-providers") {
			continue;
		}
		const match = UNUSED_PROVIDER_NAME.exec(diagnostic.message);
		if (match) {
			names.add(match[1]);
		}
	}
	return names;
}

interface CircularIndex {
	edges: Set<string>;
	modules: Set<string>;
}

/** Every module and `from->to` edge that takes part in a dependency cycle. */
export function buildCircularIndex(cycles: string[][]): CircularIndex {
	const edges = new Set<string>();
	const modules = new Set<string>();
	for (const cycle of cycles) {
		for (let i = 0; i < cycle.length; i++) {
			modules.add(cycle[i]);
			edges.add(`${cycle[i]}->${cycle[(i + 1) % cycle.length]}`);
		}
	}
	return { edges, modules };
}

/** Modules nothing imports, plus AppModule and the declared bootstrap roots. */
export function buildRootModules(graph: SerializedModuleGraph): Set<string> {
	const importedBy = new Set<string>();
	for (const edge of graph.edges) {
		importedBy.add(edge.to);
	}
	const roots = new Set<string>();
	for (const module of graph.modules) {
		if (!importedBy.has(module.name)) {
			roots.add(module.name);
		}
	}
	for (const module of graph.modules) {
		if (module.name === "AppModule") {
			roots.add(module.name);
		}
	}
	for (const root of graph.bootstrapRoots ?? []) {
		roots.add(root);
	}
	return roots;
}
