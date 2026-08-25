import type { CSSProperties, ReactNode } from "react";
import {
	countNode,
	type TreeNode,
	worstSeverity,
	worstSeverityNode,
} from "../selectors";

function FolderIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="14"
			stroke="currentColor"
			strokeWidth="1.5"
			viewBox="0 0 24 24"
			width="14"
		>
			<title>Folder</title>
			<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
		</svg>
	);
}

function FileIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="14"
			stroke="currentColor"
			strokeWidth="1.5"
			viewBox="0 0 24 24"
			width="14"
		>
			<title>File</title>
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<polyline points="14 2 14 8 20 8" />
		</svg>
	);
}

function renderNode(
	node: TreeNode,
	depth: number,
	expanded: Set<string>,
	toggleDir: (name: string) => void,
	activePath: string | null,
	onSelectFile: (path: string) => void,
	search: string
): ReactNode[] {
	const out: ReactNode[] = [];
	const dirs = Object.keys(node.children)
		.filter((k) => k.toLowerCase().includes(search))
		.sort();
	const files = Object.keys(node.files).sort();
	const pad = depth * 12;

	for (const dir of dirs) {
		const child = node.children[dir];
		const isOpen = expanded.has(child.name);
		out.push(
			<div className="tree-folder" key={`d-${child.name}`}>
				<button
					className="tree-folder-header"
					onClick={() => toggleDir(child.name)}
					style={
						{
							paddingLeft: `calc(14px + ${pad}px)`,
							"--guides": `${pad}px`,
						} as CSSProperties
					}
					type="button"
				>
					<span className="tree-chevron">{isOpen ? "\u25BC" : "\u25B6"}</span>
					<span
						className={`tree-folder-icon sev-indicator-${worstSeverityNode(child)}`}
					>
						<FolderIcon />
					</span>
					<span className="tree-folder-name">{child.name}</span>
					{!isOpen && <span className="tree-count">{countNode(child)}</span>}
				</button>
				{isOpen && (
					<div className="tree-folder-body">
						{renderNode(
							child,
							depth + 1,
							expanded,
							toggleDir,
							activePath,
							onSelectFile,
							search
						)}
					</div>
				)}
			</div>
		);
	}

	for (const fileName of files) {
		const file = node.files[fileName];
		if (search && !file.fullPath.toLowerCase().includes(search)) {
			continue;
		}
		out.push(
			<div
				className={
					activePath === file.fullPath ? "tree-file active" : "tree-file"
				}
				key={`f-${file.fullPath}`}
			>
				<button
					className="tree-file-header"
					onClick={() => onSelectFile(file.fullPath)}
					style={
						{
							paddingLeft: `calc(14px + ${pad}px)`,
							"--guides": `${pad}px`,
						} as CSSProperties
					}
					type="button"
				>
					<span
						className={`tree-file-icon sev-indicator-${worstSeverity(file.entries)}`}
					>
						<FileIcon />
					</span>
					<span className="tree-file-name">{file.name}</span>
					<span className="tree-count">{file.entries.length}</span>
				</button>
			</div>
		);
	}
	return out;
}

export function FileTree({
	node,
	expanded,
	toggleDir,
	activePath,
	onSelectFile,
	search,
}: {
	activePath: string | null;
	expanded: Set<string>;
	node: TreeNode;
	onSelectFile: (path: string) => void;
	search: string;
	toggleDir: (name: string) => void;
}) {
	return (
		<div id="diagnosis-rule-list">
			{renderNode(
				node,
				0,
				expanded,
				toggleDir,
				activePath,
				onSelectFile,
				search.trim().toLowerCase()
			)}
		</div>
	);
}

export function allFolderNames(node: TreeNode, into: Set<string>): Set<string> {
	for (const key of Object.keys(node.children)) {
		into.add(node.children[key].name);
		allFolderNames(node.children[key], into);
	}
	return into;
}
