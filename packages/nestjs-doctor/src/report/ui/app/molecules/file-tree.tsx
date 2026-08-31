import type { CSSProperties } from "react";
import type { Severity } from "../../../../common/diagnostic.js";
import { Icon } from "../atoms/icon.js";

interface AnnotatedFile {
	count: number;
	dataSevs?: string;
	hidden: boolean;
	name: string;
	path: string;
	sev: Severity | null;
}

export interface AnnotatedFolder {
	count: number;
	files: AnnotatedFile[];
	folders: AnnotatedFolder[];
	hidden: boolean;
	id: string;
	name: string;
	sev: Severity | null;
}

const SEV_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function worseSev(
	a: Severity | null,
	b: Severity | null
): Severity | null {
	if (a === null) {
		return b;
	}
	if (b === null) {
		return a;
	}
	return SEV_RANK[a] <= SEV_RANK[b] ? a : b;
}

interface TreeShape {
	children: Record<string, TreeShape>;
	files: Record<string, { fullPath: string; name: string }>;
	name: string;
}

interface AnnotateOptions {
	collectSevs?: (path: string) => string;
	fileCount: (path: string) => number;
	fileSev: (path: string) => Severity | null;
	matchesSearch: (path: string) => boolean;
}

// Turns the raw path tree into render-ready nodes: visible counts, worst
// severities, and hidden flags, folders aggregating their descendants.
export function annotateTree(
	node: TreeShape,
	options: AnnotateOptions,
	parentId = ""
): AnnotatedFolder {
	const folders = Object.keys(node.children)
		.sort()
		.map((key) =>
			annotateTree(
				node.children[key] as TreeShape,
				options,
				`${parentId}/${(node.children[key] as TreeShape).name}`
			)
		);
	const files = Object.keys(node.files)
		.sort()
		.map((key) => {
			const f = node.files[key] as { fullPath: string; name: string };
			const count = options.fileCount(f.fullPath);
			return {
				path: f.fullPath,
				name: f.name,
				count,
				sev: count > 0 ? options.fileSev(f.fullPath) : null,
				hidden: count === 0 || !options.matchesSearch(f.fullPath),
				dataSevs: options.collectSevs?.(f.fullPath),
			};
		});
	let count = 0;
	let sev: Severity | null = null;
	for (const f of files) {
		if (!f.hidden) {
			count += f.count;
			sev = worseSev(sev, f.sev);
		}
	}
	for (const child of folders) {
		if (!child.hidden) {
			count += child.count;
			sev = worseSev(sev, child.sev);
		}
	}
	return {
		id: parentId,
		name: node.name,
		folders,
		files,
		count,
		sev,
		hidden: folders.every((f) => f.hidden) && files.every((f) => f.hidden),
	};
}

interface FileTreeProps {
	activePath: string | null;
	collapsed: ReadonlySet<string>;
	onSelectFile: (path: string) => void;
	onToggleFolder: (id: string) => void;
	root: AnnotatedFolder;
}

function nodeClasses(base: string, hidden: boolean, extra?: string): string {
	return [base, extra, hidden ? "hidden" : undefined].filter(Boolean).join(" ");
}

function sevIconClasses(base: string, sev: Severity | null): string {
	return sev ? `${base} sev-indicator-${sev}` : base;
}

function FolderNode({
	folder,
	depth,
	props,
}: {
	depth: number;
	folder: AnnotatedFolder;
	props: FileTreeProps;
}) {
	const pad = depth * 12;
	const headerStyle = {
		paddingLeft: `calc(14px + ${pad}px)`,
		"--guides": `${pad}px`,
	} as CSSProperties;
	return (
		<div
			className={nodeClasses(
				"tree-folder",
				folder.hidden,
				props.collapsed.has(folder.id) ? "collapsed" : undefined
			)}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the whole row is the click target, as in the report's CSS */}
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole row is the click target, as in the report's CSS */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only tree */}
			<div
				className="tree-folder-header"
				onClick={() => props.onToggleFolder(folder.id)}
				style={headerStyle}
			>
				<span className="tree-chevron">▼</span>
				<span className={sevIconClasses("tree-folder-icon", folder.sev)}>
					<Icon name="folder" size={14} />
				</span>
				<span className="tree-folder-name">{folder.name}</span>
				<span className="tree-count">{folder.count}</span>
			</div>
			<div className="tree-folder-body">
				{folder.folders.map((child) => (
					<FolderNode
						depth={depth + 1}
						folder={child}
						key={child.id}
						props={props}
					/>
				))}
				{folder.files.map((file) => (
					<FileNodeRow
						depth={depth + 1}
						file={file}
						key={file.path}
						props={props}
					/>
				))}
			</div>
		</div>
	);
}

function FileNodeRow({
	file,
	depth,
	props,
}: {
	depth: number;
	file: AnnotatedFile;
	props: FileTreeProps;
}) {
	const pad = depth * 12;
	return (
		<div
			className={nodeClasses(
				"tree-file",
				file.hidden,
				props.activePath === file.path ? "active" : undefined
			)}
			data-path={file.path}
			data-sevs={file.dataSevs}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the whole row is the click target, as in the report's CSS */}
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole row is the click target, as in the report's CSS */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only tree */}
			<div
				className="tree-file-header"
				onClick={() => props.onSelectFile(file.path)}
				style={
					{
						paddingLeft: `calc(14px + ${pad}px)`,
						"--guides": `${pad}px`,
					} as CSSProperties
				}
			>
				<span className={sevIconClasses("tree-file-icon", file.sev)}>
					<Icon name="file" size={14} />
				</span>
				<span className="tree-file-name">{file.name}</span>
				<span className="tree-count">{file.count}</span>
			</div>
		</div>
	);
}

export function FileTree(props: FileTreeProps) {
	return (
		<>
			{props.root.folders.map((child) => (
				<FolderNode depth={0} folder={child} key={child.id} props={props} />
			))}
			{props.root.files.map((file) => (
				<FileNodeRow depth={0} file={file} key={file.path} props={props} />
			))}
		</>
	);
}
