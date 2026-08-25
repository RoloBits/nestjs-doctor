import { type ReactNode, useMemo, useState } from "react";
import type { ReportModel } from "../model";
import {
	buildFileTree,
	type FileEntry,
	groupByFile,
	isNotScored,
} from "../selectors";
import { CodeView } from "./code-view";
import { DiagInfoGroups } from "./diag-info-groups";
import { allFolderNames, FileTree } from "./file-tree";

type SevFilter = "all" | "error" | "warning" | "info";
type ScopeFilter = "all" | "file" | "project";

function Pill({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			className={active ? "sev-pill active" : "sev-pill"}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}

export function FindingsTab({ model }: { model: ReportModel }) {
	const [activeSev, setActiveSev] = useState<SevFilter>("all");
	const [activeScope, setActiveScope] = useState<ScopeFilter>("all");
	const [activeCat, setActiveCat] = useState<string>("all");
	const [showNotScored, setShowNotScored] = useState(false);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activePath, setActivePath] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(() =>
		allFolderNames(buildFileTree(groupByFile(model.diagnostics)), new Set())
	);
	const [fileExpand, setFileExpand] = useState({ above: 0, below: 0 });

	const visible = useMemo(
		() =>
			model.diagnostics.filter((d) => {
				if (!showNotScored && isNotScored(d)) {
					return false;
				}
				if (activeSev !== "all" && d.severity !== activeSev) {
					return false;
				}
				if (activeScope !== "all" && (d.scope ?? undefined) !== activeScope) {
					return false;
				}
				if (activeCat !== "all" && d.category !== activeCat) {
					return false;
				}
				return true;
			}),
		[model.diagnostics, activeSev, activeScope, activeCat, showNotScored]
	);

	const groups = useMemo(
		() => groupByFile(model.diagnostics),
		[model.diagnostics]
	);
	const tree = useMemo(() => buildFileTree(groups), [groups]);

	const activeGroup = groups.find((g) => g.path === activePath);
	const sortedEntries: FileEntry[] = activeGroup
		? activeGroup.entries.filter((e) => visible.includes(e.d))
		: [];

	const toggleDir = (name: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(name)) {
				next.delete(name);
			} else {
				next.add(name);
			}
			return next;
		});
	};

	if (model.diagnostics.length === 0) {
		return (
			<div className="diagnosis-clean">
				<svg
					aria-hidden="true"
					fill="none"
					height="48"
					stroke="var(--score-green)"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2"
					viewBox="0 0 24 24"
					width="48"
				>
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
					<polyline points="22 4 12 14.01 9 11.01" />
				</svg>
				<p>No issues found</p>
				<span>Your project passed all checks.</span>
			</div>
		);
	}

	const filterCount =
		(activeSev !== "all" ? 1 : 0) +
		(activeScope !== "all" ? 1 : 0) +
		(activeCat !== "all" ? 1 : 0);

	const pathParts = activePath?.split("/") ?? [];
	const fileName = pathParts.pop();
	const parentDir = pathParts.join("/");
	const sevCounts = { error: 0, warning: 0, info: 0 };
	for (const { d } of sortedEntries) {
		sevCounts[d.severity]++;
	}

	return (
		<div id="diagnosis-sidebar-wrapper">
			<div id="diagnosis-sidebar">
				<div
					className={
						filtersOpen ? "diagnosis-toolbar filters-open" : "diagnosis-toolbar"
					}
				>
					<div className="schema-sidebar-header">
						<span className="schema-sidebar-title">Files</span>
						<span className="schema-entity-count">{groups.length}</span>
						<span style={{ flex: 1 }} />
						<button
							aria-label="Expand all"
							className="st-btn"
							onClick={() => setExpanded(allFolderNames(tree, new Set()))}
							title="Expand all"
							type="button"
						>
							<svg
								aria-hidden="true"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								viewBox="0 0 17 14"
							>
								<title>Expand all</title>
								<line x1="1" x2="8" y1="3" y2="3" />
								<line x1="1" x2="8" y1="7" y2="7" />
								<line x1="1" x2="8" y1="11" y2="11" />
								<path d="M11 5l2.5 3L16 5" />
							</svg>
						</button>
						<button
							aria-label="Collapse all"
							className="st-btn"
							onClick={() => setExpanded(new Set())}
							title="Collapse all"
							type="button"
						>
							<svg
								aria-hidden="true"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								viewBox="0 0 17 14"
							>
								<title>Collapse all</title>
								<line x1="1" x2="8" y1="3" y2="3" />
								<line x1="1" x2="8" y1="7" y2="7" />
								<line x1="1" x2="8" y1="11" y2="11" />
								<path d="M11 11l2.5-3L16 11" />
							</svg>
						</button>
					</div>
					<div className="mg-side-search">
						<input
							autoComplete="off"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search files"
							spellCheck={false}
							type="search"
							value={search}
						/>
					</div>
					<label className="schema-sync">
						<input
							checked={showNotScored}
							onChange={(e) => setShowNotScored(e.target.checked)}
							type="checkbox"
						/>
						<span>Show not scored</span>
					</label>
					<hr className="diag-divider" />
					<button
						aria-expanded={filtersOpen}
						className="diag-filters-toggle"
						onClick={() => setFiltersOpen((v) => !v)}
						type="button"
					>
						Filters
						{filterCount > 0 && (
							<span className="diag-filters-count">{filterCount}</span>
						)}
						<span className="diag-filters-caret">{"\u25B8"}</span>
					</button>
					{filtersOpen && (
						<div className="filter-rows">
							<div className="sev-filters">
								<span className="filter-label">Severity</span>
								{(
									[
										["all", "All"],
										["error", "Errors"],
										["warning", "Warnings"],
										["info", "Info"],
									] as const
								).map(([value, label]) => (
									<Pill
										active={activeSev === value}
										key={value}
										onClick={() => setActiveSev(value)}
									>
										{label}
									</Pill>
								))}
							</div>
							<div className="scope-filters">
								<span className="filter-label">Scope</span>
								{(["all", "file", "project"] as const).map((s) => (
									<Pill
										active={activeScope === s}
										key={s}
										onClick={() => setActiveScope(s)}
									>
										{s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
									</Pill>
								))}
							</div>
							<div className="cat-filters">
								<span className="filter-label">Category</span>
								<Pill
									active={activeCat === "all"}
									onClick={() => setActiveCat("all")}
								>
									All
								</Pill>
								{Object.keys(model.summary.byCategory).map((cat) => (
									<Pill
										active={activeCat === cat}
										key={cat}
										onClick={() => setActiveCat(cat)}
									>
										{cat[0].toUpperCase() + cat.slice(1)}
									</Pill>
								))}
							</div>
						</div>
					)}
				</div>
				<FileTree
					activePath={activePath}
					expanded={expanded}
					node={tree}
					onSelectFile={(path) => {
						setActivePath(path);
						setFileExpand({ above: 0, below: 0 });
					}}
					search={search}
					toggleDir={toggleDir}
				/>
			</div>
			<div id="diagnosis-main">
				{activePath && activeGroup ? (
					<div id="diagnosis-file-view">
						<div id="diagnosis-file-header">
							<div className="file-view-title">{fileName}</div>
							{parentDir && <div className="file-view-dir">{parentDir}/</div>}
							<div className="file-view-counts">
								{sevCounts.error > 0 && (
									<span>
										<span
											className="fv-count-dot"
											style={{ background: "var(--sev-error)" }}
										/>{" "}
										{sevCounts.error} error{sevCounts.error !== 1 ? "s" : ""}
									</span>
								)}
								{sevCounts.warning > 0 && (
									<span>
										<span
											className="fv-count-dot"
											style={{ background: "var(--sev-warning)" }}
										/>{" "}
										{sevCounts.warning} warning
										{sevCounts.warning !== 1 ? "s" : ""}
									</span>
								)}
								{sevCounts.info > 0 && (
									<span>
										<span
											className="fv-count-dot"
											style={{ background: "var(--sev-info)" }}
										/>{" "}
										{sevCounts.info} info
									</span>
								)}
							</div>
						</div>
						<div id="diagnosis-file-code">
							<CodeView
								fileExpand={fileExpand}
								fullSource={model.fileSources[activePath]}
								onExpandAbove={() =>
									setFileExpand((f) => ({ ...f, above: f.above + 20 }))
								}
								onExpandBelow={() =>
									setFileExpand((f) => ({ ...f, below: f.below + 20 }))
								}
								sortedEntries={sortedEntries}
								sourceLines={model.sourceLines}
							/>
						</div>
						<div id="diagnosis-file-info">
							<DiagInfoGroups
								entries={sortedEntries}
								examples={model.examples}
							/>
						</div>
					</div>
				) : (
					<div id="diagnosis-empty-state">
						<p>Select a file to view its diagnostics</p>
					</div>
				)}
			</div>
		</div>
	);
}
