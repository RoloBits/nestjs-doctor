import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import {
	type Diagnostic,
	isCodeDiagnostic,
	isSchemaDiagnostic,
	type Severity,
} from "../../../../common/diagnostic.js";
import { TextButton } from "../atoms/button.js";
import { Icon } from "../atoms/icon.js";
import { pinExpandBelow } from "../lib/scroll.js";
import { buildFileTree, compressTree } from "../lib/tree.js";
import { CheckboxRow } from "../molecules/checkbox-row.js";
import {
	CodeViewer,
	type CodeViewerOptions,
} from "../molecules/code-viewer.js";
import { EmptyState } from "../molecules/empty-state.js";
import { FileHeader } from "../molecules/file-header.js";
import {
	type AnnotatedFolder,
	annotateTree,
	FileTree,
	worseSev,
} from "../molecules/file-tree.js";
import { PillGroup } from "../molecules/pill-group.js";
import { SearchField } from "../molecules/search-field.js";
import { SidebarHeader, TreeToolbar } from "../molecules/sidebar-header.js";

const EXPAND_STEP = 20;

const SEV_ITEMS = [
	{ value: "all", label: "All" },
	{ value: "error", label: "Errors" },
	{ value: "warning", label: "Warnings" },
	{ value: "info", label: "Info" },
];

const SCOPE_ITEMS = [
	{ value: "all", label: "All" },
	{ value: "file", label: "File" },
	{ value: "project", label: "Project" },
];

const CAT_ITEMS = [
	{ value: "all", label: "All" },
	{ value: "security", label: "Security" },
	{ value: "correctness", label: "Correctness" },
	{ value: "schema", label: "Schema" },
	{ value: "architecture", label: "Architecture" },
	{ value: "performance", label: "Performance" },
];

const SEV_VAR: Record<Severity, string> = {
	error: "var(--sev-error)",
	warning: "var(--sev-warning)",
	info: "var(--sev-info)",
};

interface Entry {
	d: Diagnostic;
	origIdx: number;
}

interface Filters {
	cat: string;
	query: string;
	scope: string;
	sev: string;
	showNotScored: boolean;
}

export interface DiagnosisCallbacks {
	setDiagnosisBadge: (withNotScored: boolean) => void;
}

function isNotScored(d: Diagnostic): boolean {
	return Boolean(d.surfaces && !d.surfaces.includes("score"));
}

function entryVisible(entry: Entry, filters: Filters): boolean {
	if (!filters.showNotScored && isNotScored(entry.d)) {
		return false;
	}
	if (filters.sev !== "all" && entry.d.severity !== filters.sev) {
		return false;
	}
	if (filters.scope !== "all" && entry.d.scope !== filters.scope) {
		return false;
	}
	if (filters.cat !== "all" && entry.d.category !== filters.cat) {
		return false;
	}
	return true;
}

function normalizeQuery(query: string): string {
	return query.trim().toLowerCase();
}

interface DiagEntryMeta {
	line: number;
	message: string;
	rule: string;
	severity: Severity;
}

interface Segment {
	diagEntries: DiagEntryMeta[];
	end: number;
	start: number;
}

// Merges each diagnostic's source range into display segments, exactly as
// the string renderer did: ranges within four lines join into one segment.
function buildSegments(
	sorted: Entry[],
	totalLines: number,
	expand: { above: number; below: number }
): Segment[] {
	const segments: Segment[] = [];
	for (const entry of sorted) {
		if (!isCodeDiagnostic(entry.d)) {
			continue;
		}
		const sl = entry.d.sourceLines;
		let segStart: number;
		let segEnd: number;
		if (sl && sl.length > 0) {
			segStart = (sl[0] as { line: number }).line;
			segEnd = (sl.at(-1) as { line: number }).line;
		} else {
			segStart = Math.max(1, entry.d.line - 3);
			segEnd = Math.min(totalLines, entry.d.line + 3);
		}
		const meta: DiagEntryMeta = {
			line: entry.d.line,
			rule: entry.d.rule,
			message: entry.d.message,
			severity: entry.d.severity,
		};
		const prev = segments.at(-1);
		if (prev && segStart <= prev.end + 4) {
			prev.end = Math.max(prev.end, segEnd);
			prev.diagEntries.push(meta);
			continue;
		}
		segments.push({ start: segStart, end: segEnd, diagEntries: [meta] });
	}
	if (segments.length > 0) {
		const first = segments[0] as Segment;
		const last = segments.at(-1) as Segment;
		first.start = Math.max(1, first.start - expand.above);
		last.end = Math.min(totalLines, last.end + expand.below);
	}
	return segments;
}

function segmentViewerOptions(
	segment: Segment,
	lineCount: number,
	skipScrollIntoView: boolean
): CodeViewerOptions {
	const highlightLines: number[] = [];
	const lineMetadata: NonNullable<CodeViewerOptions["lineMetadata"]> = {};
	for (const de of segment.diagEntries) {
		const relLine = de.line - segment.start + 1;
		if (relLine >= 1 && relLine <= lineCount) {
			highlightLines.push(relLine);
			lineMetadata[relLine] ??= [];
			lineMetadata[relLine].push({
				rule: de.rule,
				message: de.message,
				severity: de.severity,
			});
		}
	}
	return {
		highlightLines,
		lineMetadata,
		firstLineNumber: segment.start,
		skipScrollIntoView,
	};
}

function NoSourceMessage({ monorepo }: { monorepo: boolean }) {
	if (monorepo) {
		return (
			<div className="no-source-msg">
				Source code viewer is not available in monorepo reports.
				<br />
				<span style={{ opacity: 0.7, fontSize: "0.92em" }}>
					Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a
					single package for the full code viewer.
				</span>
			</div>
		);
	}
	return (
		<div className="no-source-msg">
			Source code not available for project-scoped rules
		</div>
	);
}

function FileCode({
	report,
	filePath,
	sorted,
	expand,
	skipScroll,
	onExpandAbove,
	onExpandBelow,
}: {
	expand: { above: number; below: number };
	filePath: string;
	onExpandAbove: () => void;
	onExpandBelow: () => void;
	report: ReportArtifact;
	skipScroll: boolean;
	sorted: Entry[];
}) {
	const fullSource = report.sources[filePath];
	const hasAnySource = sorted.some((entry) => {
		const sl = isCodeDiagnostic(entry.d) ? entry.d.sourceLines : undefined;
		return sl && sl.length > 0;
	});

	if (!(hasAnySource || fullSource)) {
		return <NoSourceMessage monorepo={report.monorepo} />;
	}

	if (fullSource) {
		const allLines = fullSource.split("\n");
		const totalLines = allLines.length;
		const segments = buildSegments(sorted, totalLines, expand);
		const first = segments[0];
		const last = segments.at(-1);
		return (
			<>
				{first && first.start > 1 && (
					// biome-ignore lint/a11y/noStaticElementInteractions: the whole row is the click target, as in the report's CSS
					// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole row is the click target, as in the report's CSS
					// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only expander
					<div className="code-expand-row" onClick={onExpandAbove}>
						<Icon name="caretUp" size={12} /> Expand{" "}
						{Math.min(EXPAND_STEP, first.start - 1)} lines
					</div>
				)}
				{segments.map((segment, sg) => {
					const gapBefore =
						sg > 0 ? segment.start - (segments[sg - 1] as Segment).end - 1 : 0;
					const snippetLines = allLines.slice(segment.start - 1, segment.end);
					return (
						<div
							key={`${filePath}:${segment.start}`}
							style={{ display: "contents" }}
						>
							{gapBefore > 0 && (
								<div className="code-separator-row">
									⋯ {gapBefore} line{gapBefore !== 1 ? "s" : ""} hidden
								</div>
							)}
							<div>
								<CodeViewer
									code={snippetLines.join("\n")}
									options={segmentViewerOptions(
										segment,
										snippetLines.length,
										sg > 0 || skipScroll
									)}
								/>
							</div>
						</div>
					);
				})}
				{last && last.end < totalLines && (
					// biome-ignore lint/a11y/noStaticElementInteractions: the whole row is the click target, as in the report's CSS
					// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole row is the click target, as in the report's CSS
					// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only expander
					<div
						className="code-expand-row code-expand-below"
						onClick={onExpandBelow}
					>
						<Icon name="caretDown" size={12} /> Expand{" "}
						{Math.min(EXPAND_STEP, totalLines - last.end)} lines
					</div>
				)}
			</>
		);
	}

	const firstWithSource = sorted.find((entry) => {
		const sl = isCodeDiagnostic(entry.d) ? entry.d.sourceLines : undefined;
		return sl && sl.length > 0;
	});
	const sl =
		firstWithSource && isCodeDiagnostic(firstWithSource.d)
			? (firstWithSource.d.sourceLines as { line: number; text: string }[])
			: null;
	if (!sl || sl.length === 0) {
		return null;
	}
	const firstLineNum = (sl[0] as { line: number }).line;
	const snippet: Segment = {
		start: firstLineNum,
		end: (sl.at(-1) as { line: number }).line,
		diagEntries: sorted
			.filter((entry) => isCodeDiagnostic(entry.d))
			.map((entry) => ({
				line: (entry.d as { line: number }).line,
				rule: entry.d.rule,
				message: entry.d.message,
				severity: entry.d.severity,
			})),
	};
	return (
		<div>
			<CodeViewer
				code={sl.map((s) => s.text).join("\n")}
				options={segmentViewerOptions(snippet, sl.length, false)}
			/>
		</div>
	);
}

interface RuleGroup {
	entries: Entry[];
	rule: string;
}

function groupByRule(sorted: Entry[]): RuleGroup[] {
	const groups: RuleGroup[] = [];
	const byKey = new Map<string, RuleGroup>();
	for (const entry of sorted) {
		const key = `${entry.d.rule}\u0000${entry.d.help || ""}`;
		let group = byKey.get(key);
		if (!group) {
			group = { rule: entry.d.rule, entries: [] };
			byKey.set(key, group);
			groups.push(group);
		}
		group.entries.push(entry);
	}
	return groups;
}

function DiagInfoItem({
	group,
	report,
}: {
	group: RuleGroup;
	report: ReportArtifact;
}) {
	const helpText = group.entries.find((entry) => entry.d.help)?.d.help;
	const example = report.examples[group.rule];
	return (
		<div className="diag-info-item">
			{group.entries.map((entry) => {
				const d = entry.d;
				return (
					<div key={entry.origIdx} style={{ display: "contents" }}>
						<div className="diag-info-header">
							<div
								className="sev-dot"
								style={{ background: SEV_VAR[d.severity] }}
							/>
							<span className={`code-sev-badge ${d.severity}`}>
								{d.severity}
							</span>
							<span className="code-rule-badge">{d.rule}</span>
							{isNotScored(d) && (
								<span
									className="code-notscored-badge"
									title="Reported only. Counts toward neither the score nor --blocking."
								>
									not scored
								</span>
							)}
							{isCodeDiagnostic(d) ? (
								<span className="diag-linecol">
									Ln {d.line}, Col {d.column}
								</span>
							) : (
								isSchemaDiagnostic(d) &&
								d.entity && (
									<span className="diag-linecol">
										{d.entity}
										{d.schemaColumn ? `.${d.schemaColumn}` : ""}
									</span>
								)
							)}
						</div>
						<div className="diag-info-msg">{d.message}</div>
					</div>
				);
			})}
			{helpText && (
				<div className="diag-info-help">
					<div className="section-label">Recommendation</div>
					{helpText}
				</div>
			)}
			{example && (
				<div className="diag-info-examples">
					<div className="section-label">Examples</div>
					<div className="examples-group">
						<div className="example-block bad">
							<div className="example-tag bad">Bad</div>
							<div className="example-code">
								<CodeViewer
									code={example.bad}
									options={{ lineNumbers: false }}
								/>
							</div>
						</div>
						<div className="example-block good">
							<div className="example-tag good">Good</div>
							<div className="example-code">
								<CodeViewer
									code={example.good}
									options={{ lineNumbers: false }}
								/>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function collectFolderIds(folder: AnnotatedFolder, out: string[]): void {
	for (const child of folder.folders) {
		out.push(child.id);
		collectFolderIds(child, out);
	}
}

export function DiagnosisTab({
	report,
	callbacks,
}: {
	callbacks: DiagnosisCallbacks;
	report: ReportArtifact;
}) {
	const diagnostics = report.diagnostics;
	const [sev, setSev] = useState("all");
	const [scope, setScope] = useState("all");
	const [cat, setCat] = useState("all");
	const [showNotScored, setShowNotScored] = useState(false);
	const [query, setQuery] = useState("");
	const [activePath, setActivePath] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [fileExpand, setFileExpand] = useState<
		Record<string, { above: number; below: number }>
	>({});
	const everSelectedRef = useRef(false);
	const pendingScrollRef = useRef<
		{ type: "restore"; top: number } | { type: "pin" } | null
	>(null);
	const mainRef = useRef<HTMLDivElement>(null);
	const codeRef = useRef<HTMLDivElement>(null);

	const filters: Filters = { sev, scope, cat, showNotScored, query };
	const q = normalizeQuery(query);

	const fileMap = useMemo(() => {
		const map: Record<string, Entry[]> = {};
		diagnostics.forEach((d, origIdx) => {
			const fp = d.filePath || "";
			map[fp] ??= [];
			map[fp].push({ d, origIdx });
		});
		for (const entries of Object.values(map)) {
			entries.sort(
				(a, b) =>
					(isCodeDiagnostic(a.d) ? a.d.line : 0) -
					(isCodeDiagnostic(b.d) ? b.d.line : 0)
			);
		}
		return map;
	}, [diagnostics]);

	const treeRoot = useMemo(() => {
		const root = buildFileTree(fileMap, "diags");
		compressTree(root);
		return root;
	}, [fileMap]);

	const visibleEntries = (path: string): Entry[] =>
		(fileMap[path] ?? []).filter((entry) => entryVisible(entry, filters));

	const annotated = annotateTree(treeRoot, {
		fileCount: (path) => visibleEntries(path).length,
		fileSev: (path) =>
			visibleEntries(path).reduce<Severity | null>(
				(worst, entry) => worseSev(worst, entry.d.severity),
				null
			),
		matchesSearch: (path) => q === "" || path.toLowerCase().includes(q),
		collectSevs: (path) => {
			const seen: string[] = [];
			for (const entry of fileMap[path] ?? []) {
				if (!seen.includes(entry.d.severity)) {
					seen.push(entry.d.severity);
				}
			}
			return seen.join(",");
		},
	});

	// Searching expands every folder it reveals, and they stay expanded.
	useEffect(() => {
		if (q === "") {
			return;
		}
		setCollapsed((prev) => {
			const next = new Set(prev);
			const visible: string[] = [];
			collectVisibleFolderIds(annotated, visible);
			for (const id of visible) {
				next.delete(id);
			}
			return next.size === prev.size ? prev : next;
		});
	}, [q, annotated]);

	useEffect(() => {
		callbacks.setDiagnosisBadge(showNotScored);
	}, [callbacks, showNotScored]);

	// A file hidden by the filters loses its selection, like the old renderer.
	const activeVisible =
		activePath !== null &&
		visibleEntries(activePath).length > 0 &&
		(q === "" || activePath.toLowerCase().includes(q));
	useEffect(() => {
		if (activePath !== null && !activeVisible) {
			setActivePath(null);
		}
	}, [activePath, activeVisible]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll position resets whenever the shown file re-renders, matching the old showFile
	useLayoutEffect(() => {
		const pending = pendingScrollRef.current;
		pendingScrollRef.current = null;
		if (pending?.type === "restore" && mainRef.current) {
			mainRef.current.scrollTop = pending.top;
			return;
		}
		if (pending?.type === "pin" && codeRef.current) {
			pinExpandBelow(codeRef.current);
			return;
		}
		if (activePath !== null && mainRef.current) {
			mainRef.current.scrollTop = 0;
		}
	}, [activePath, sev, scope, cat, showNotScored, q, fileExpand]);

	const anyNotScored = diagnostics.some(isNotScored);
	const filterCount =
		(sev !== "all" ? 1 : 0) +
		(scope !== "all" ? 1 : 0) +
		(cat !== "all" ? 1 : 0);
	const shownFiles = Object.keys(fileMap).filter(
		(fp) =>
			visibleEntries(fp).length > 0 &&
			(q === "" || fp.toLowerCase().includes(q))
	).length;

	if (diagnostics.length === 0) {
		return (
			<>
				<div id="diagnosis-sidebar" style={{ display: "none" }} />
				<div id="diagnosis-main" style={{ left: 0 }}>
					<EmptyState
						classes="diagnosis-clean"
						extra={<span>Your project passed all checks.</span>}
						icon={{ name: "checkCircle", size: 48 }}
						text="No issues found"
					/>
				</div>
			</>
		);
	}

	const active = activeVisible && activePath !== null ? activePath : null;
	const sorted =
		active !== null
			? visibleEntries(active).sort(
					(a, b) =>
						(isCodeDiagnostic(a.d) ? a.d.line : 0) -
						(isCodeDiagnostic(b.d) ? b.d.line : 0)
				)
			: [];
	const expand = (active !== null && fileExpand[active]) || {
		above: 0,
		below: 0,
	};
	let emptyDisplay: string | undefined;
	if (active) {
		emptyDisplay = "none";
	} else if (everSelectedRef.current) {
		emptyDisplay = "flex";
	}

	return (
		<>
			<div id="diagnosis-sidebar">
				<div
					className={[
						"diagnosis-toolbar",
						filtersOpen ? "filters-open" : undefined,
					]
						.filter(Boolean)
						.join(" ")}
				>
					<SidebarHeader
						count={shownFiles}
						countId="diag-file-count"
						title="Files"
						toolbar={
							<TreeToolbar
								noun="folder"
								onCollapseAll={() => {
									const all: string[] = [];
									collectFolderIds(annotated, all);
									setCollapsed(new Set(all));
								}}
								onExpandAll={() => setCollapsed(new Set())}
								prefix="diag"
							/>
						}
					/>
					<SearchField
						id="diag-search"
						onChange={setQuery}
						placeholder="Search files"
						value={query}
					/>
					<CheckboxRow
						checked={showNotScored}
						id="diag-show-notscored"
						label="Show not scored"
						onChange={setShowNotScored}
						rowId="diag-notscored-row"
						style={anyNotScored ? undefined : { display: "none" }}
					/>
					<hr
						className="diag-divider"
						id="diag-notscored-divider"
						style={anyNotScored ? undefined : { display: "none" }}
					/>
					<TextButton
						ariaExpanded={filtersOpen}
						classes="diag-filters-toggle"
						id="diag-filters-toggle"
						onClick={() => setFiltersOpen((open) => !open)}
					>
						<Icon ariaHidden={true} name="filter" />
						Filters
						<span
							className="diag-filters-count"
							id="diag-filters-count"
							style={filterCount > 0 ? undefined : { display: "none" }}
						>
							{filterCount}
						</span>
						<span className="diag-filters-caret">▸</span>
					</TextButton>
					<div className="filter-rows" id="diag-filters-body">
						<div className="sev-filters">
							<span className="filter-label">Severity</span>
							<PillGroup
								active={sev}
								items={SEV_ITEMS}
								name="sev"
								onSelect={setSev}
							/>
						</div>
						<div className="scope-filters">
							<span className="filter-label">Scope</span>
							<PillGroup
								active={scope}
								items={SCOPE_ITEMS}
								name="scope"
								onSelect={setScope}
							/>
						</div>
						<div className="cat-filters">
							<span className="filter-label">Category</span>
							<PillGroup
								active={cat}
								items={CAT_ITEMS}
								name="cat"
								onSelect={setCat}
							/>
						</div>
					</div>
				</div>
				<div id="diagnosis-rule-list">
					<FileTree
						activePath={active}
						collapsed={collapsed}
						onSelectFile={(path) => {
							everSelectedRef.current = true;
							setActivePath(path);
						}}
						onToggleFolder={(id) =>
							setCollapsed((prev) => {
								const next = new Set(prev);
								if (next.has(id)) {
									next.delete(id);
								} else {
									next.add(id);
								}
								return next;
							})
						}
						root={annotated}
					/>
				</div>
			</div>
			<div id="diagnosis-main" ref={mainRef}>
				<EmptyState
					icon={{
						name: "fileText",
						size: 48,
						stroke: "var(--text-dim)",
						strokeWidth: "1.5",
					}}
					id="diagnosis-empty-state"
					style={emptyDisplay ? { display: emptyDisplay } : undefined}
					text="Select a file to view its diagnostics"
				/>
				<div
					id="diagnosis-file-view"
					style={{ display: active ? "block" : "none" }}
				>
					<div id="diagnosis-file-header">
						{active !== null && (
							<FileHeader
								filePath={active}
								severities={sorted.map((entry) => entry.d.severity)}
							/>
						)}
					</div>
					<div id="diagnosis-file-code" ref={codeRef}>
						{active !== null && (
							<FileCode
								expand={expand}
								filePath={active}
								onExpandAbove={() => {
									pendingScrollRef.current = {
										type: "restore",
										top: mainRef.current?.scrollTop ?? 0,
									};
									setFileExpand((prev) => ({
										...prev,
										[active]: {
											above: (prev[active]?.above ?? 0) + EXPAND_STEP,
											below: prev[active]?.below ?? 0,
										},
									}));
								}}
								onExpandBelow={() => {
									pendingScrollRef.current = { type: "pin" };
									setFileExpand((prev) => ({
										...prev,
										[active]: {
											above: prev[active]?.above ?? 0,
											below: (prev[active]?.below ?? 0) + EXPAND_STEP,
										},
									}));
								}}
								report={report}
								skipScroll={pendingScrollRef.current !== null}
								sorted={sorted}
							/>
						)}
					</div>
					<div id="diagnosis-file-info">
						{active !== null &&
							groupByRule(sorted).map((group, index) => (
								<DiagInfoItem
									group={group}
									// biome-ignore lint/suspicious/noArrayIndexKey: groups have no stable identity beyond their order
									key={`${group.rule}:${index}`}
									report={report}
								/>
							))}
					</div>
				</div>
			</div>
		</>
	);
}

function collectVisibleFolderIds(folder: AnnotatedFolder, out: string[]): void {
	for (const child of folder.folders) {
		if (!child.hidden) {
			out.push(child.id);
			collectVisibleFolderIds(child, out);
		}
	}
}
