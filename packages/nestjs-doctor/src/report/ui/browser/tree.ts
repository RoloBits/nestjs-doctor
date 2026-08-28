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
