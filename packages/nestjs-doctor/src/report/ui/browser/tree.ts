type Severity = "error" | "info" | "warning";

interface TreeNode {
	children: Record<string, TreeNode>;
	files: Record<string, FileNode>;
	name: string;
}

interface FileNode {
	fullPath: string;
	name: string;
	[itemsKey: string]: unknown;
}

// Splits each path in `fileMap` into folder nodes, hanging the entry's items
// off the leaf under `itemsKey`.
export function buildFileTree<T>(
	fileMap: Record<string, T[]>,
	itemsKey: string
): TreeNode {
	const root: TreeNode = { name: "", children: {}, files: {} };
	for (const [fp, items] of Object.entries(fileMap)) {
		if (fp === "") {
			continue;
		}
		const parts = fp.split("/");
		const fName = parts.pop() as string;
		let node = root;
		for (const part of parts) {
			if (!node.children[part]) {
				node.children[part] = { name: part, children: {}, files: {} };
			}
			node = node.children[part];
		}
		const fileNode = { name: fName, fullPath: fp } as unknown as FileNode;
		fileNode[itemsKey] = items;
		node.files[fName] = fileNode;
	}
	return root;
}

// Collapses a folder holding exactly one folder and no files into its child.
export function compressTree(root: TreeNode): void {
	function compress(n: TreeNode) {
		for (const child of Object.values(n.children)) {
			compress(child);
		}
		const cKeys = Object.keys(n.children);
		if (cKeys.length === 1 && Object.keys(n.files).length === 0) {
			const only = n.children[cKeys[0]];
			n.name = n.name ? `${n.name}/${only.name}` : only.name;
			n.children = only.children;
			n.files = only.files;
		}
	}
	for (const child of Object.values(root.children)) {
		compress(child);
	}
}

export function worstSev<T>(
	itemList: T[],
	getSeverity: (item: T) => string
): Severity {
	let worst: Severity = "info";
	for (const item of itemList) {
		const s = getSeverity(item);
		if (s === "error") {
			return "error";
		}
		if (s === "warning") {
			worst = "warning";
		}
	}
	return worst;
}

export function worstSevNode(
	n: TreeNode,
	itemsKey: string,
	getSeverity: (item: unknown) => string
): Severity {
	let worst: Severity = "info";
	for (const child of Object.values(n.children)) {
		const cs = worstSevNode(child, itemsKey, getSeverity);
		if (cs === "error") {
			return "error";
		}
		if (cs === "warning") {
			worst = "warning";
		}
	}
	for (const file of Object.values(n.files)) {
		const fs = worstSev(file[itemsKey] as unknown[], getSeverity);
		if (fs === "error") {
			return "error";
		}
		if (fs === "warning") {
			worst = "warning";
		}
	}
	return worst;
}

export function countItems(n: TreeNode, itemsKey: string): number {
	let total = 0;
	for (const child of Object.values(n.children)) {
		total += countItems(child, itemsKey);
	}
	for (const file of Object.values(n.files)) {
		total += (file[itemsKey] as unknown[]).length;
	}
	return total;
}
