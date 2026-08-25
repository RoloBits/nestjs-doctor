import type { Diagnostic, SerializedModuleGraph, Severity } from "./model";

export const CAT_META: Record<string, { color: string; label: string }> = {
	security: { color: "var(--cat-security)", label: "Security" },
	correctness: { color: "var(--cat-correctness)", label: "Correctness" },
	schema: { color: "var(--cat-schema)", label: "Schema" },
	architecture: { color: "var(--cat-architecture)", label: "Architecture" },
	performance: { color: "var(--cat-performance)", label: "Performance" },
};

export const CAT_ORDER = [
	"security",
	"correctness",
	"schema",
	"architecture",
	"performance",
];

export function scoreTone(value: number): "green" | "yellow" | "red" {
	if (value >= 75) {
		return "green";
	}
	if (value >= 50) {
		return "yellow";
	}
	return "red";
}

/** Reported only: never counts toward the score or a build failure. */
export function isNotScored(d: Diagnostic): boolean {
	return !!d.surfaces && !d.surfaces.includes("score");
}

export interface FileEntry {
	d: Diagnostic;
	origIdx: number;
}

/** Diagnostics grouped by file path, each group sorted by line. */
export function groupByFile(
	diagnostics: Diagnostic[]
): Array<{ path: string; entries: FileEntry[] }> {
	const map = new Map<string, FileEntry[]>();
	const lineOf = (d: Diagnostic) => ("line" in d ? d.line : 0);
	diagnostics.forEach((d, origIdx) => {
		const path = d.filePath || "";
		const list = map.get(path);
		if (list) {
			list.push({ d, origIdx });
		} else {
			map.set(path, [{ d, origIdx }]);
		}
	});
	return [...map.entries()]
		.map(([path, entries]) => ({
			path,
			entries: entries.sort((a, b) => lineOf(a.d) - lineOf(b.d)),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
}

export interface TreeNode {
	children: Record<string, TreeNode>;
	files: Record<
		string,
		{ name: string; fullPath: string; entries: FileEntry[] }
	>;
	name: string;
}

export function buildFileTree(
	groups: Array<{ path: string; entries: FileEntry[] }>
): TreeNode {
	const root: TreeNode = { name: "", children: {}, files: {} };
	for (const { path, entries } of groups) {
		if (path === "") {
			continue;
		}
		const parts = path.split("/");
		const fileName = parts.pop() as string;
		let node = root;
		for (const part of parts) {
			node.children[part] ??= { name: part, children: {}, files: {} };
			node = node.children[part];
		}
		node.files[fileName] = { name: fileName, fullPath: path, entries };
	}
	// Legacy never compresses the unnamed root, keeping top-level dirs visible.
	for (const key of Object.keys(root.children)) {
		compressTree(root.children[key]);
	}
	return root;
}

function compressTree(node: TreeNode): void {
	for (const key of Object.keys(node.children)) {
		compressTree(node.children[key]);
	}
	const childKeys = Object.keys(node.children);
	const fileKeys = Object.keys(node.files);
	if (childKeys.length === 1 && fileKeys.length === 0) {
		const child = node.children[childKeys[0]];
		node.name = node.name ? `${node.name}/${child.name}` : child.name;
		node.children = child.children;
		node.files = child.files;
	}
}

export function worstSeverity(entries: FileEntry[]): Severity {
	let worst: Severity = "info";
	for (const { d } of entries) {
		if (d.severity === "error") {
			return "error";
		}
		if (d.severity === "warning") {
			worst = "warning";
		}
	}
	return worst;
}

export function worstSeverityNode(node: TreeNode): Severity {
	let worst: Severity = "info";
	for (const key of Object.keys(node.children)) {
		const child = worstSeverityNode(node.children[key]);
		if (child === "error") {
			return "error";
		}
		if (child === "warning") {
			worst = "warning";
		}
	}
	for (const file of Object.values(node.files)) {
		const fileSev = worstSeverity(file.entries);
		if (fileSev === "error") {
			return "error";
		}
		if (fileSev === "warning") {
			worst = "warning";
		}
	}
	return worst;
}

export function countNode(node: TreeNode): number {
	let total = 0;
	for (const key of Object.keys(node.children)) {
		total += countNode(node.children[key]);
	}
	for (const file of Object.values(node.files)) {
		total += file.entries.length;
	}
	return total;
}

/** Modules nothing imports, plus AppModule and the declared bootstrap roots. */
export function rootModules(graph: SerializedModuleGraph): Set<string> {
	const importedBy = new Set(graph.edges.map((e) => e.to));
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
