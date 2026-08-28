import {
	type ReactNode,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import type { Severity } from "../../../../common/diagnostic.js";
import { buildFileTree, compressTree } from "../../browser/tree.js";
import { TextButton } from "../atoms/button.js";
import { Icon } from "../atoms/icon.js";
import {
	LAB_INITIAL_CODE,
	type LabPreset,
	PLAYGROUND_PRESETS,
} from "../lib/lab-presets.js";
import { pinExpandBelow } from "../lib/scroll.js";
import {
	CodeViewer,
	type CodeViewerOptions,
} from "../molecules/code-viewer.js";
import { FileHeader } from "../molecules/file-header.js";
import { annotateTree, FileTree, worseSev } from "../molecules/file-tree.js";

const PG_EXPAND_STEP = 20;

const SEV_COLORS: Record<string, string> = {
	error: "var(--sev-error)",
	warning: "var(--sev-warning)",
	info: "var(--sev-info)",
};

const PRESET_GROUPS = [
	{
		label: "File rules",
		options: [
			{ value: "todo", label: "Find TODO comments" },
			{ value: "console-log", label: "Find console.log statements" },
			{ value: "large-file", label: "Detect large files" },
		],
	},
	{
		label: "Project rules",
		options: [
			{ value: "orphan-modules", label: "Find orphan modules" },
			{ value: "unused-providers", label: "Find unused providers" },
		],
	},
];

const FILE_HINT =
	"context.fileText · context.filePath · context.report({ message, line })";
const PROJECT_HINT =
	"context.files · context.fileSources · context.modules · context.edges · context.circularDeps · context.providers · context.report({ message, filePath, line })";

interface PgResult {
	category: string;
	filePath: string;
	isError?: boolean;
	line: number;
	message: string;
	ruleId: string;
	severity: string;
}

interface PgEntry {
	idx: number;
	res: PgResult;
}

interface CmEditorGlobal {
	cmEditor?: {
		dispatch: (spec: {
			changes: { from: number; insert: string; to: number };
		}) => void;
		state: { doc: { length: number; toString(): string } };
	};
}

interface LabRegistry {
	firstOpen?: () => void;
}

const registry: LabRegistry = {};

export function labOpened(): void {
	registry.firstOpen?.();
}

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

function editor() {
	return (globalThis as CmEditorGlobal).cmEditor;
}

function setEditorCode(code: string): void {
	const cm = editor();
	cm?.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: code } });
}

// Executes the user's check function over the report payload, exactly as
// the shipped Rule Lab did.
function runRule(
	report: ReportArtifact,
	userCode: string,
	meta: { category: string; ruleId: string; scope: string; severity: string }
): { error?: string; results: PgResult[] } {
	let checkFn: (context: unknown) => void;
	try {
		checkFn = new Function("context", userCode) as (context: unknown) => void;
	} catch (err) {
		return { error: `Syntax error: ${(err as Error).message}`, results: [] };
	}
	const ruleId = meta.ruleId || "my-rule";
	const results: PgResult[] = [];
	if (meta.scope === "project") {
		const projectCtx = {
			files: Object.keys(report.sources),
			fileSources: report.sources,
			modules: report.graph.modules,
			edges: report.graph.edges,
			circularDeps: report.graph.circularDeps,
			providers: report.providers,
			report: (finding: {
				filePath?: string;
				line?: number;
				message?: string;
			}) => {
				results.push({
					message: finding.message || "No message",
					line: finding.line || 1,
					filePath: finding.filePath || "",
					ruleId,
					category: meta.category,
					severity: meta.severity,
				});
			},
		};
		try {
			checkFn(projectCtx);
		} catch (err) {
			results.push({
				message: `Runtime error: ${(err as Error).message}`,
				line: 1,
				filePath: "",
				ruleId,
				category: meta.category,
				severity: "error",
				isError: true,
			});
		}
	} else {
		for (const [filePath, fileText] of Object.entries(report.sources)) {
			const ctx = {
				fileText,
				filePath,
				report: (finding: { line?: number; message?: string }) => {
					results.push({
						message: finding.message || "No message",
						line: finding.line || 1,
						filePath,
						ruleId,
						category: meta.category,
						severity: meta.severity,
					});
				},
			};
			try {
				checkFn(ctx);
			} catch (err) {
				results.push({
					message: `Runtime error: ${(err as Error).message}`,
					line: 1,
					filePath,
					ruleId,
					category: meta.category,
					severity: "error",
					isError: true,
				});
			}
		}
	}
	results.sort((a, b) => {
		if (a.filePath < b.filePath) {
			return -1;
		}
		if (a.filePath > b.filePath) {
			return 1;
		}
		return a.line - b.line;
	});
	return { results };
}

interface Segment {
	end: number;
	entries: PgEntry[];
	start: number;
}

function buildSegments(
	sorted: PgEntry[],
	totalLines: number,
	expand: { above: number; below: number }
): Segment[] {
	const segments: Segment[] = [];
	for (const entry of sorted) {
		const segStart = Math.max(1, entry.res.line - 3);
		const segEnd = Math.min(totalLines, entry.res.line + 3);
		const prev = segments.at(-1);
		if (prev && segStart <= prev.end + 4) {
			prev.end = Math.max(prev.end, segEnd);
			prev.entries.push(entry);
			continue;
		}
		segments.push({ start: segStart, end: segEnd, entries: [entry] });
	}
	if (segments.length > 0) {
		const first = segments[0] as Segment;
		const last = segments.at(-1) as Segment;
		first.start = Math.max(1, first.start - expand.above);
		last.end = Math.min(totalLines, last.end + expand.below);
	}
	return segments;
}

function segmentOptions(
	segment: Segment,
	lineCount: number,
	skipScrollIntoView: boolean
): CodeViewerOptions {
	const highlightLines: number[] = [];
	const lineMetadata: NonNullable<CodeViewerOptions["lineMetadata"]> = {};
	for (const entry of segment.entries) {
		const relLine = entry.res.line - segment.start + 1;
		if (relLine >= 1 && relLine <= lineCount) {
			highlightLines.push(relLine);
			lineMetadata[relLine] ??= [];
			lineMetadata[relLine].push({
				rule: entry.res.ruleId,
				message: entry.res.message,
				severity: entry.res.severity,
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

function SelectField({
	id,
	label,
	value,
	onChange,
	wide,
	children,
}: {
	children: ReactNode;
	id: string;
	label: string;
	onChange: (value: string) => void;
	value: string;
	wide?: boolean;
}) {
	return (
		<div
			className={
				wide ? "playground-field playground-field-wide" : "playground-field"
			}
		>
			<label htmlFor={id}>{label}</label>
			<select id={id} onChange={(e) => onChange(e.target.value)} value={value}>
				{children}
			</select>
		</div>
	);
}

function TextField({
	id,
	label,
	value,
	onChange,
	placeholder,
	wide,
}: {
	id: string;
	label: string;
	onChange: (value: string) => void;
	placeholder?: string;
	value: string;
	wide?: boolean;
}) {
	return (
		<div
			className={
				wide ? "playground-field playground-field-wide" : "playground-field"
			}
		>
			<label htmlFor={id}>{label}</label>
			<input
				id={id}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				spellCheck={false}
				type="text"
				value={value}
			/>
		</div>
	);
}

export function LabTab({ report }: { report: ReportArtifact }) {
	const [ruleId, setRuleId] = useState("my-rule");
	const [category, setCategory] = useState("correctness");
	const [severity, setSeverity] = useState("warning");
	const [scope, setScope] = useState("file");
	const [description, setDescription] = useState("");
	const [preset, setPreset] = useState("todo");
	const [error, setError] = useState<string | null>(null);
	const [results, setResults] = useState<PgResult[] | null>(null);
	const [activePath, setActivePath] = useState<string | null>(null);
	const [activeStandalone, setActiveStandalone] = useState<number | null>(null);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [expandState, setExpandState] = useState<
		Record<string, { above: number; below: number }>
	>({});
	const metaTrackedRef = useRef(false);
	const pendingScrollRef = useRef<
		{ top: number; type: "restore" } | { type: "pin" } | null
	>(null);
	const resultsPaneRef = useRef<HTMLDivElement>(null);
	const fileCodeRef = useRef<HTMLDivElement>(null);

	// The first tab activation loads the selected preset, like the chunk did.
	const loadPresetRef = useRef<(key: string) => void>(() => undefined);
	registry.firstOpen = () => loadPresetRef.current(preset);

	const loadPreset = (key: string) => {
		const p: LabPreset | undefined = PLAYGROUND_PRESETS[key];
		if (!p) {
			return;
		}
		setRuleId(p.ruleId);
		setCategory(p.category);
		setSeverity(p.severity);
		setScope(p.scope || "file");
		setDescription(p.description);
		setEditorCode(p.code);
	};
	loadPresetRef.current = loadPreset;

	const onMetaChange = () => {
		if (!metaTrackedRef.current) {
			metaTrackedRef.current = true;
			track("rule_lab_metadata_changed");
		}
	};

	const onScopeChange = (next: string) => {
		track("rule_lab_scope_changed");
		setScope(next);
		const current = PLAYGROUND_PRESETS[preset];
		if (current && current.scope !== next) {
			for (const group of PRESET_GROUPS) {
				for (const option of group.options) {
					const candidate = PLAYGROUND_PRESETS[option.value];
					if (candidate && candidate.scope === next) {
						setPreset(option.value);
						loadPreset(option.value);
						return;
					}
				}
			}
		}
	};

	const run = () => {
		track("rule_lab_run");
		const cm = editor();
		if (!cm) {
			setError("Editor not loaded — check your internet connection.");
			setResults(null);
			return;
		}
		const outcome = runRule(report, cm.state.doc.toString(), {
			ruleId,
			category,
			severity,
			scope,
		});
		setExpandState({});
		setActivePath(null);
		setActiveStandalone(null);
		setCollapsed(new Set());
		if (outcome.error) {
			setError(outcome.error);
			setResults(null);
			return;
		}
		setError(null);
		setResults(outcome.results);
		const firstFile = outcome.results.find((r) => r.filePath);
		if (firstFile) {
			setActivePath(firstFile.filePath);
		} else if (outcome.results.length > 0) {
			setActiveStandalone(0);
		}
	};

	const fileMap = useMemo(() => {
		const map: Record<string, PgEntry[]> = {};
		const standalone: PgEntry[] = [];
		(results ?? []).forEach((res, idx) => {
			if (!res.filePath) {
				standalone.push({ res, idx });
				return;
			}
			map[res.filePath] ??= [];
			map[res.filePath].push({ res, idx });
		});
		map[""] = standalone;
		return map;
	}, [results]);

	const treeRoot = useMemo(() => {
		const root = buildFileTree(fileMap, "findings");
		compressTree(root);
		return root;
	}, [fileMap]);

	const annotated = annotateTree(treeRoot, {
		fileCount: (path) => (fileMap[path] ?? []).length,
		fileSev: (path) =>
			(fileMap[path] ?? []).reduce<Severity | null>(
				(worst, entry) => worseSev(worst, entry.res.severity as Severity),
				null
			),
		matchesSearch: () => true,
	});

	const standaloneItems = fileMap[""] ?? [];
	const hasResults = results !== null && results.length > 0;
	const findings = activePath ? (fileMap[activePath] ?? []) : [];
	const sorted = findings.slice().sort((a, b) => a.res.line - b.res.line);
	const expand = (activePath && expandState[activePath]) || {
		above: 0,
		below: 0,
	};
	const fullSource = activePath ? report.sources[activePath] : undefined;

	let emptyContent: ReactNode = <p>Write a check function and click Run</p>;
	if (
		results !== null &&
		results.length === 0 &&
		report.monorepo &&
		scope === "file"
	) {
		emptyContent = (
			<p>
				No source files available in monorepo reports.
				<br />
				<span style={{ opacity: 0.7, fontSize: "0.92em" }}>
					Run <code>npx nestjs-doctor &lt;package-path&gt; --report</code> on a
					single package to use the Lab with file rules.
				</span>
			</p>
		);
	}

	const applyPendingScroll = () => {
		const pending = pendingScrollRef.current;
		pendingScrollRef.current = null;
		if (pending?.type === "restore" && resultsPaneRef.current) {
			resultsPaneRef.current.scrollTop = pending.top;
		} else if (pending?.type === "pin" && fileCodeRef.current) {
			pinExpandBelow(fileCodeRef.current);
		}
	};
	// Scroll adjustments run after the expanded segments have rendered.
	useLayoutEffect(applyPendingScroll);

	const segments =
		activePath && fullSource
			? buildSegments(sorted, fullSource.split("\n").length, expand)
			: [];
	const allLines = fullSource ? fullSource.split("\n") : [];
	const first = segments[0];
	const last = segments.at(-1);
	const skipScroll = pendingScrollRef.current !== null;

	return (
		<>
			<div className="playground-editor">
				<div className="playground-section-label playground-title">
					RULE LAB
				</div>
				<p className="playground-subtitle">
					Write and test{" "}
					<a
						href="https://www.nestjs.doctor/docs/rules/custom"
						rel="noopener"
						target="_blank"
					>
						custom rules
					</a>{" "}
					against your project. Use <code>/nestjs-doctor-create-rule</code> with
					an AI agent to{" "}
					<a
						href="https://www.nestjs.doctor/docs/coding-agents"
						rel="noopener"
						target="_blank"
					>
						scaffold rules automatically
					</a>
					.
				</p>
				<div className="playground-form">
					<div className="playground-form-row">
						<TextField
							id="pg-rule-id"
							label="Rule ID"
							onChange={setRuleId}
							value={ruleId}
						/>
						<SelectField
							id="pg-category"
							label="Category"
							onChange={(value) => {
								onMetaChange();
								setCategory(value);
							}}
							value={category}
						>
							<option value="correctness">correctness</option>
							<option value="security">security</option>
							<option value="performance">performance</option>
							<option value="architecture">architecture</option>
						</SelectField>
						<SelectField
							id="pg-severity"
							label="Severity"
							onChange={(value) => {
								onMetaChange();
								setSeverity(value);
							}}
							value={severity}
						>
							<option value="warning">warning</option>
							<option value="error">error</option>
							<option value="info">info</option>
						</SelectField>
					</div>
					<div className="playground-form-row">
						<TextField
							id="pg-description"
							label="Description"
							onChange={setDescription}
							placeholder="What does this rule check?"
							value={description}
							wide={true}
						/>
					</div>
				</div>
				<div className="playground-preset">
					<SelectField
						id="pg-scope"
						label="Scope"
						onChange={onScopeChange}
						value={scope}
					>
						<option value="file">File rule</option>
						<option value="project">Project rule</option>
					</SelectField>
					<div className="playground-preset-sep" />
					<SelectField
						id="pg-preset"
						label="Load example"
						onChange={(value) => {
							track("rule_lab_preset_loaded");
							setPreset(value);
							loadPreset(value);
						}}
						value={preset}
						wide={true}
					>
						{PRESET_GROUPS.map((group) => {
							const visible = group.options.filter(
								(option) => PLAYGROUND_PRESETS[option.value]?.scope === scope
							);
							if (visible.length === 0) {
								return null;
							}
							return (
								<optgroup key={group.label} label={group.label}>
									{visible.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</optgroup>
							);
						})}
					</SelectField>
				</div>
				<div className="playground-section-label">CHECK FUNCTION</div>
				<div className="pg-cm-wrap" id="pg-cm-editor" />
				<div className="pg-context-hint" id="pg-context-hint">
					{scope === "project" ? PROJECT_HINT : FILE_HINT}
				</div>
				<script id="pg-code-init" type="text/plain">
					{LAB_INITIAL_CODE}
				</script>
				<div className="playground-actions">
					<TextButton id="pg-run-btn" onClick={run}>
						▶ Run Rule
					</TextButton>
				</div>
				<div
					className="playground-error"
					id="pg-error"
					style={{ display: error ? undefined : "none" }}
				>
					{error}
				</div>
			</div>
			<div className="playground-results" ref={resultsPaneRef}>
				<div className="playground-section-label">
					RESULTS{" "}
					<span id="pg-result-count">
						{results !== null
							? `(${results.length} finding${results.length !== 1 ? "s" : ""})`
							: ""}
					</span>
				</div>
				<div
					id="pg-file-view"
					style={{ display: activePath ? "block" : "none" }}
				>
					<div id="pg-file-header">
						{activePath && (
							<FileHeader
								filePath={activePath}
								severities={findings.map(
									(entry) => entry.res.severity as Severity
								)}
							/>
						)}
					</div>
					<div
						className="playground-code-body"
						id="pg-file-code"
						ref={fileCodeRef}
					>
						{activePath && !fullSource && (
							<div className="no-source-msg">
								{report.monorepo ? (
									<>
										Source code viewer is not available in monorepo reports.
										<br />
										<span style={{ opacity: 0.7, fontSize: "0.92em" }}>
											Run{" "}
											<code>
												npx nestjs-doctor &lt;package-path&gt; --report
											</code>{" "}
											on a single package for the full code viewer.
										</span>
									</>
								) : (
									"Source code not available"
								)}
							</div>
						)}
						{activePath && fullSource && (
							<>
								{first && first.start > 1 && (
									// biome-ignore lint/a11y/noStaticElementInteractions: the whole row is the click target, as in the report's CSS
									// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole row is the click target, as in the report's CSS
									// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only expander
									<div
										className="code-expand-row"
										onClick={() => {
											pendingScrollRef.current = {
												type: "restore",
												top: resultsPaneRef.current?.scrollTop ?? 0,
											};
											setExpandState((prev) => ({
												...prev,
												[activePath]: {
													above:
														(prev[activePath]?.above ?? 0) + PG_EXPAND_STEP,
													below: prev[activePath]?.below ?? 0,
												},
											}));
										}}
									>
										<Icon name="caretUp" size={12} /> Expand{" "}
										{Math.min(PG_EXPAND_STEP, first.start - 1)} lines
									</div>
								)}
								{segments.map((segment, sg) => {
									const gapBefore =
										sg > 0
											? segment.start - (segments[sg - 1] as Segment).end - 1
											: 0;
									const snippetLines = allLines.slice(
										segment.start - 1,
										segment.end
									);
									return (
										<div
											key={`${activePath}:${segment.start}`}
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
													options={segmentOptions(
														segment,
														snippetLines.length,
														sg > 0 || skipScroll
													)}
												/>
											</div>
										</div>
									);
								})}
								{last && last.end < allLines.length && (
									// biome-ignore lint/a11y/noStaticElementInteractions: the whole row is the click target, as in the report's CSS
									// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole row is the click target, as in the report's CSS
									// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only expander
									<div
										className="code-expand-row code-expand-below"
										onClick={() => {
											pendingScrollRef.current = { type: "pin" };
											setExpandState((prev) => ({
												...prev,
												[activePath]: {
													above: prev[activePath]?.above ?? 0,
													below:
														(prev[activePath]?.below ?? 0) + PG_EXPAND_STEP,
												},
											}));
										}}
									>
										<Icon name="caretDown" size={12} /> Expand{" "}
										{Math.min(PG_EXPAND_STEP, allLines.length - last.end)} lines
									</div>
								)}
							</>
						)}
					</div>
				</div>
				<div id="pg-result-list">
					{standaloneItems.map((item, si) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: the row is the click target, as in the report's CSS
						// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the row is the click target, as in the report's CSS
						// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only list
						<div
							className={
								activeStandalone === si
									? "pg-standalone-item active"
									: "pg-standalone-item"
							}
							data-idx={si}
							key={item.idx}
							onClick={() => {
								setActiveStandalone(si);
								setActivePath(null);
							}}
							style={{ paddingLeft: 14 }}
						>
							<div
								className="sev-dot"
								style={{
									background:
										SEV_COLORS[item.res.severity] || SEV_COLORS.warning,
								}}
							/>
							<span className="finding-msg">{item.res.message}</span>
						</div>
					))}
					{hasResults && (
						<FileTree
							activePath={activePath}
							collapsed={collapsed}
							onSelectFile={(path) => {
								track("rule_lab_result_opened");
								setActiveStandalone(null);
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
					)}
				</div>
				<div
					className="playground-empty"
					id="pg-result-empty"
					style={{ display: hasResults ? "none" : "flex" }}
				>
					<Icon name="pencil" size={40} />
					{emptyContent}
				</div>
			</div>
		</>
	);
}
