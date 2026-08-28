import { useEffect, useRef, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import type { Severity } from "../../../../common/diagnostic.js";
import type {
	SchemaEntity,
	SerializedSchemaGraph,
} from "../../../../common/schema.js";
import type { IconName } from "../../atoms/icon.js";
import { columnKind, foreignKeyColumns } from "../../browser/column-kinds.js";
import { SCHEMA_DEFAULT_MAX_COLS } from "../../browser/schema-layout.js";
import { IconButton, TextButton } from "../atoms/button.js";
import { Icon } from "../atoms/icon.js";
import { relLabel, SchemaCanvas } from "../lib/schema-canvas.js";
import { CheckboxRow } from "../molecules/checkbox-row.js";
import { EmptyState } from "../molecules/empty-state.js";
import { SearchField } from "../molecules/search-field.js";
import { SidebarHeader, TreeToolbar } from "../molecules/sidebar-header.js";
import { TreeRow } from "../molecules/tree-row.js";
import { ZoomBar } from "../molecules/zoom-bar.js";

const TIP_PK = "Primary key · identifies the row";
const TIP_FK = "Foreign key · points at another table";
const TIP_IDX = "Indexed · unique or carries an index";

const SEV_VAR: Record<Severity, string> = {
	error: "var(--sev-error)",
	warning: "var(--sev-warning)",
	info: "var(--sev-info)",
};

const ON_ENTITY = /on '([^']+)'/;
const FIRST_QUOTED = /'([^']+)'/;

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

function columnIconName(kind: string | null): IconName {
	if (kind === "pk") {
		return "schemaKey";
	}
	if (kind === "fk") {
		return "schemaFk";
	}
	if (kind === "idx") {
		return "schemaIndex";
	}
	return "schemaColumn";
}

function columnTip(kind: string | null): string | undefined {
	if (kind === "pk") {
		return TIP_PK;
	}
	if (kind === "fk") {
		return TIP_FK;
	}
	if (kind === "idx") {
		return TIP_IDX;
	}
	return undefined;
}

interface TreeState {
	open: ReadonlySet<string>;
	toggle: (id: string) => void;
}

function ColumnRows({ entity }: { entity: SchemaEntity }) {
	const foreignKeys = foreignKeyColumns(entity);
	return (
		<>
			{entity.columns.map((col) => {
				const kind = columnKind(col, foreignKeys);
				const tags: string[] = [];
				if (col.isNullable) {
					tags.push("null");
				}
				if (col.isGenerated) {
					tags.push("gen");
				}
				if (col.isUnique && !col.isPrimary) {
					tags.push("uniq");
				}
				if (col.hasIndex && !(col.isPrimary || col.isUnique)) {
					tags.push("idx");
				}
				return (
					<TreeRow
						depth={3}
						extra={
							<>
								<span className="st-col-type">{col.type}</span>
								{col.defaultValue && (
									<span className="st-col-default">= {col.defaultValue}</span>
								)}
								{tags.length > 0 && (
									<span className="st-col-tags">{tags.join(" · ")}</span>
								)}
							</>
						}
						icon={<Icon name={columnIconName(kind)} />}
						iconTip={columnTip(kind)}
						key={col.name}
						label={col.name}
					/>
				);
			})}
		</>
	);
}

function EntityGroup({
	id,
	label,
	count,
	tree,
	children,
}: {
	children: React.ReactNode;
	count: number;
	id: string;
	label: string;
	tree: TreeState;
}) {
	const open = tree.open.has(id);
	return (
		<>
			<TreeRow
				depth={2}
				extra={<span className="st-count">{count}</span>}
				icon={<Icon name={open ? "schemaFolderOpen" : "schemaFolder"} />}
				label={<span className="st-group-name">{label}</span>}
				onClick={() => tree.toggle(id)}
				onToggle={() => tree.toggle(id)}
				toggleGlyph={open ? "▾" : "▸"}
			/>
			<div className={open ? "st-children st-open" : "st-children"}>
				{children}
			</div>
		</>
	);
}

function EntityRows({
	entity,
	index,
	tree,
	hidden,
	highlighted,
	onSelect,
}: {
	entity: SchemaEntity;
	hidden: boolean;
	highlighted: boolean;
	index: number;
	onSelect: () => void;
	tree: TreeState;
}) {
	const entityId = `entity-${index}`;
	const open = tree.open.has(entityId);
	const displayName = entity.tableName || entity.name;
	const pks = entity.columns.filter((c) => c.isPrimary);
	const indexes = entity.columns.filter(
		(c) => !c.isPrimary && (c.isUnique || c.hasIndex)
	);
	const rowStyle = hidden ? { display: "none" } : undefined;
	const activate = () => {
		tree.toggle(entityId);
		onSelect();
	};
	return (
		<>
			<div data-entity={entity.name} style={rowStyle}>
				<TreeRow
					classes={highlighted ? "st-selected" : undefined}
					depth={1}
					icon={<Icon name={open ? "schemaTableOpen" : "schemaTable"} />}
					label={<span className="st-entity-name">{displayName}</span>}
					onClick={activate}
					onToggle={activate}
					toggleGlyph={open ? "▾" : "▸"}
				/>
			</div>
			<div
				className={open ? "st-children st-open" : "st-children"}
				style={rowStyle}
			>
				{entity.columns.length > 0 && (
					<EntityGroup
						count={entity.columns.length}
						id={`${entityId}-cols`}
						label="columns"
						tree={tree}
					>
						<ColumnRows entity={entity} />
					</EntityGroup>
				)}
				{pks.length > 0 && (
					<EntityGroup
						count={pks.length}
						id={`${entityId}-keys`}
						label="keys"
						tree={tree}
					>
						<TreeRow
							depth={3}
							extra={
								<span className="st-col-type">
									({pks.map((p) => p.name).join(", ")})
								</span>
							}
							icon={<Icon name="schemaKey" />}
							iconTip={TIP_PK}
							label={`${displayName.toLowerCase()}_pkey`}
						/>
					</EntityGroup>
				)}
				{entity.relations.length > 0 && (
					<EntityGroup
						count={entity.relations.length}
						id={`${entityId}-fks`}
						label="foreign keys"
						tree={tree}
					>
						{entity.relations.map((rel) => (
							<TreeRow
								depth={3}
								extra={
									<>
										<span className="st-col-type">({rel.propertyName})</span>
										<span className="st-rel-type">{relLabel(rel.type)}</span>
									</>
								}
								icon={<Icon name="schemaFk" />}
								iconTip={TIP_FK}
								key={rel.propertyName}
								label={`${displayName.toLowerCase()}_${rel.propertyName}_fkey`}
							/>
						))}
					</EntityGroup>
				)}
				{indexes.length > 0 && (
					<EntityGroup
						count={indexes.length}
						id={`${entityId}-idx`}
						label="indexes"
						tree={tree}
					>
						{indexes.map((col) => (
							<TreeRow
								depth={3}
								extra={<span className="st-col-type">{col.type}</span>}
								icon={<Icon name="schemaIndex" />}
								iconTip={TIP_IDX}
								key={col.name}
								label={col.name}
							/>
						))}
					</EntityGroup>
				)}
			</div>
		</>
	);
}

function allTreeIds(schema: SerializedSchemaGraph): string[] {
	const ids = ["root-tables"];
	schema.entities.forEach((_entity, index) => {
		const entityId = `entity-${index}`;
		ids.push(
			entityId,
			`${entityId}-cols`,
			`${entityId}-keys`,
			`${entityId}-fks`,
			`${entityId}-idx`
		);
	});
	return ids;
}

export function SchemaTab({ report }: { report: ReportArtifact }) {
	const schema = report.schema;
	const [selected, setSelected] = useState<string | null>(null);
	const [highlighted, setHighlighted] = useState<string | null>(null);
	const [focusedMode, setFocusedMode] = useState(schema.entities.length > 7);
	const [showAllCols, setShowAllCols] = useState(false);
	const [syncSidebar, setSyncSidebar] = useState(true);
	const [query, setQuery] = useState("");
	const [zoomPct, setZoomPct] = useState(100);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [open, setOpen] = useState<ReadonlySet<string>>(
		new Set(["root-tables"])
	);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const relBadgeRef = useRef<HTMLDivElement>(null);
	const sidebarRef = useRef<HTMLDivElement>(null);
	const controllerRef = useRef<SchemaCanvas | null>(null);
	const pendingRevealRef = useRef<string | null | undefined>(undefined);

	const tree: TreeState = {
		open,
		toggle: (id) =>
			setOpen((prev) => {
				const next = new Set(prev);
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				return next;
			}),
	};

	// The list mirrors a canvas-driven selection when sync is on.
	const reflectSelection = (name: string | null) => {
		setHighlighted(name);
		if (name) {
			const index = schema.entities.findIndex((e) => e.name === name);
			if (index >= 0) {
				setOpen((prev) => {
					const next = new Set(prev);
					next.add(`entity-${index}`);
					next.add(`entity-${index}-cols`);
					return next;
				});
			}
			pendingRevealRef.current = name;
		} else {
			// A cleared selection closes every table, leaving the root open.
			setOpen(new Set(["root-tables"]));
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: the controller mounts once for the page's lifetime
	useEffect(() => {
		const canvas = canvasRef.current;
		const tooltipEl = tooltipRef.current;
		const relBadgeEl = relBadgeRef.current;
		if (!(canvas && tooltipEl && relBadgeEl)) {
			return;
		}
		const instance = new SchemaCanvas({
			canvas,
			tooltipEl,
			relBadgeEl,
			schema,
			callbacks: {
				onSelect: (name) => {
					setSelected(name);
					if (syncRef.current) {
						reflectSelectionRef.current(name);
					}
				},
				onZoom: setZoomPct,
			},
		});
		controllerRef.current = instance;
		instance.init();
		const onResize = () => {
			if (canvas.offsetParent !== null) {
				instance.resize();
			}
		};
		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("resize", onResize);
			instance.destroy();
			controllerRef.current = null;
		};
	}, []);

	// Callback refs so the mount-once controller sees current handlers.
	const syncRef = useRef(syncSidebar);
	syncRef.current = syncSidebar;
	const reflectSelectionRef = useRef(reflectSelection);
	reflectSelectionRef.current = reflectSelection;

	// Scrolls a revealed table to the top of the list, under the sticky header.
	useEffect(() => {
		const name = pendingRevealRef.current;
		pendingRevealRef.current = undefined;
		const panel = sidebarRef.current;
		if (!(name && panel)) {
			return;
		}
		let row: HTMLElement | null = null;
		for (const el of panel.querySelectorAll<HTMLElement>("[data-entity]")) {
			if (el.dataset.entity === name) {
				row = el;
				break;
			}
		}
		const sticky = panel.querySelector(".schema-sidebar-sticky");
		if (!row) {
			return;
		}
		const stickyH = sticky ? sticky.getBoundingClientRect().height : 0;
		const delta =
			row.getBoundingClientRect().top -
			panel.getBoundingClientRect().top -
			stickyH;
		panel.scrollTop += delta;
	});

	const q = query.trim().toLowerCase();
	const entityHidden = (entity: SchemaEntity): boolean => {
		if (q === "") {
			return false;
		}
		const label = (entity.tableName || entity.name).toLowerCase();
		return !(label.includes(q) || entity.name.toLowerCase().includes(q));
	};

	const selectEntity = (name: string) => {
		setSelected(name);
		if (syncSidebar) {
			setHighlighted(name);
		}
		controllerRef.current?.selectFromSidebar(name);
	};

	const schemaDiags = report.diagnostics.filter((d) => d.category === "schema");
	const entityNames = new Set(schema.entities.map((e) => e.name));
	const diagEntity = (message: string): string | null => {
		const onMatch = message.match(ON_ENTITY);
		if (onMatch && entityNames.has(onMatch[1] as string)) {
			return onMatch[1] as string;
		}
		const firstMatch = message.match(FIRST_QUOTED);
		if (firstMatch && entityNames.has(firstMatch[1] as string)) {
			return firstMatch[1] as string;
		}
		return null;
	};

	const ormTitle = schema.orm
		? `${schema.orm.charAt(0).toUpperCase()}${schema.orm.slice(1)} Tables`
		: "Tables";
	const showEmpty = focusedMode && !selected;

	const showAllTables = () => {
		setFocusedMode(false);
		controllerRef.current?.showAllTables();
	};

	return (
		<>
			<div id="schema-sidebar" ref={sidebarRef}>
				<div className="schema-sidebar-sticky">
					<SidebarHeader
						count={schema.entities.length}
						countId="schema-entity-count"
						title={ormTitle}
						titleId="schema-sidebar-title"
						toolbar={
							<TreeToolbar
								noun="table"
								onCollapseAll={() => setOpen(new Set(["root-tables"]))}
								onExpandAll={() => {
									track("schema_tree_expanded");
									setOpen(new Set(allTreeIds(schema)));
								}}
								onHide={() => {
									document
										.getElementById("tab-schema")
										?.classList.add("sidebar-collapsed");
									controllerRef.current?.resize();
								}}
								prefix="schema"
								subject="diagram"
							/>
						}
					/>
					<SearchField
						id="schema-search"
						onChange={setQuery}
						placeholder="Search tables"
						value={query}
					/>
					<CheckboxRow
						checked={syncSidebar}
						id="schema-sync-sidebar"
						label="Sync with diagram"
						onChange={(checked) => {
							setSyncSidebar(checked);
							if (checked) {
								reflectSelection(controllerRef.current?.selectedEntity ?? null);
							}
						}}
						tip="Sync · the list follows the table you pick in the diagram"
					/>
					<div className="schema-disclaimer">
						Schema inferred from source code — may not reflect the actual
						database.
					</div>
				</div>
				<div id="schema-entity-list">
					<TreeRow
						depth={0}
						extra={<span className="st-count">{schema.entities.length}</span>}
						icon={
							<Icon
								name={
									open.has("root-tables") ? "schemaFolderOpen" : "schemaFolder"
								}
							/>
						}
						label={<span className="st-group-name">tables</span>}
						onClick={() => tree.toggle("root-tables")}
						onToggle={() => tree.toggle("root-tables")}
						toggleGlyph={open.has("root-tables") ? "▾" : "▸"}
					/>
					<div
						className={
							open.has("root-tables") ? "st-children st-open" : "st-children"
						}
					>
						{schema.entities.map((entity, index) => (
							<EntityRows
								entity={entity}
								hidden={entityHidden(entity)}
								highlighted={highlighted === entity.name}
								index={index}
								key={entity.name}
								onSelect={() => selectEntity(entity.name)}
								tree={tree}
							/>
						))}
					</div>
				</div>
			</div>
			<div id="schema-main">
				<div id="schema-canvas-wrap">
					<IconButton
						ariaLabel="Show the table list"
						icon="sidebarShow"
						id="schema-sidebar-show"
						onClick={() => {
							document
								.getElementById("tab-schema")
								?.classList.remove("sidebar-collapsed");
							controllerRef.current?.resize();
						}}
						tip="Show list · bring the table list back"
					/>
					<EmptyState
						extra={
							<TextButton
								classes="st-btn schema-empty-action"
								id="schema-show-all"
								onClick={showAllTables}
							>
								Show all tables
							</TextButton>
						}
						icon={{
							name: "toggleView",
							size: 48,
							stroke: "var(--text-dim)",
							strokeWidth: "1.5",
						}}
						id="schema-empty-state"
						style={showEmpty ? { display: "flex" } : undefined}
						text="Select an entity from the sidebar to explore its schema"
					/>
					<div id="schema-toolbar">
						<ZoomBar
							onFit={() => controllerRef.current?.recenter()}
							onRange={(pct) => controllerRef.current?.setZoomPct(pct)}
							onZoomIn={() => controllerRef.current?.zoomIn()}
							onZoomOut={() => controllerRef.current?.zoomOut()}
							pct={zoomPct}
							prefix="schema"
							subject="diagram"
						/>
						<IconButton
							ariaLabel={focusedMode ? "Show all tables" : "Focus one table"}
							ariaPressed={!focusedMode}
							icon="toggleView"
							id="schema-toggle-view"
							modifier={
								focusedMode ? "schema-diagram-btn" : "schema-diagram-btn active"
							}
							onClick={() => {
								if (focusedMode) {
									showAllTables();
								} else {
									setFocusedMode(true);
									controllerRef.current?.focusOneTable();
								}
							}}
							tip={
								focusedMode
									? "All tables · lay out the whole schema at once"
									: "Focus · show one table and what it relates to"
							}
						/>
						<IconButton
							ariaLabel="Re-center diagram"
							icon="recenter"
							id="schema-recenter"
							modifier="schema-diagram-btn"
							onClick={() => controllerRef.current?.recenter()}
							tip="Re-center · bring the diagram back into view"
						/>
						<IconButton
							ariaLabel="Expand tables"
							icon="expandTables"
							id="schema-expand-tables"
							modifier="schema-diagram-btn"
							onClick={() => controllerRef.current?.setShowCols(true)}
							tip="Expand · show the columns inside each table"
						/>
						<IconButton
							ariaLabel="Minimize tables"
							icon="minimizeTables"
							id="schema-minimize-tables"
							modifier="schema-diagram-btn"
							onClick={() => controllerRef.current?.setShowCols(false)}
							tip="Minimize · collapse tables to names only"
						/>
						<IconButton
							ariaLabel={
								showAllCols
									? `Show the first ${SCHEMA_DEFAULT_MAX_COLS} columns`
									: "Show every column"
							}
							ariaPressed={showAllCols}
							icon="toggleColumns"
							id="schema-toggle-cols"
							modifier={
								showAllCols ? "schema-diagram-btn active" : "schema-diagram-btn"
							}
							onClick={() => {
								const next = !showAllCols;
								setShowAllCols(next);
								controllerRef.current?.setShowAllCols(next);
							}}
							tip={
								showAllCols
									? `First ${SCHEMA_DEFAULT_MAX_COLS} · go back to a short column list`
									: "Every column · stop cutting the list at seven"
							}
						/>
					</div>
					<canvas
						id="schema-canvas"
						ref={canvasRef}
						style={showEmpty ? { display: "none" } : undefined}
					/>
					<div
						className="schema-tooltip"
						id="schema-tooltip"
						ref={tooltipRef}
						style={{ display: "none" }}
					/>
					<div
						className="schema-rel-badge"
						id="schema-rel-badge"
						ref={relBadgeRef}
						style={{ display: "none" }}
					/>
				</div>
				<div id="schema-diag-panel">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: the whole header is the click target, as in the report's CSS */}
					{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole header is the click target, as in the report's CSS */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only drawer */}
					<div
						id="schema-diag-header"
						onClick={() => {
							setDrawerOpen((prev) => !prev);
							controllerRef.current?.resize();
						}}
					>
						<Icon
							classes={
								drawerOpen ? "schema-diag-chevron open" : "schema-diag-chevron"
							}
							id="schema-diag-chevron"
							name="chevronSmall"
							size={10}
						/>
						<span className="schema-diag-title">Problems</span>
						<span
							className={
								schemaDiags.length > 0
									? "schema-diag-count has-issues"
									: "schema-diag-count"
							}
							id="schema-diag-count"
						>
							{schemaDiags.length}{" "}
							{schemaDiags.length === 1 ? "issue" : "issues"}
						</span>
					</div>
					<div
						id="schema-diag-body"
						style={{ display: drawerOpen ? "block" : "none" }}
					>
						<div id="schema-diag-list">
							{schemaDiags.length === 0 ? (
								<div className="sd-empty">No schema issues found</div>
							) : (
								schemaDiags.map((sd, index) => {
									const entityName = diagEntity(sd.message);
									return (
										<div
											className="sd-item"
											// biome-ignore lint/suspicious/noArrayIndexKey: diagnostics have no stable identity beyond their order
											key={`${sd.rule}:${index}`}
										>
											<span
												className="sev-dot"
												style={{ background: SEV_VAR[sd.severity] }}
											/>
											<span className="sd-rule">{sd.rule}</span>
											{entityName && (
												// biome-ignore lint/a11y/noStaticElementInteractions: the entity chip is the click target, as in the report's CSS
												// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the entity chip is the click target, as in the report's CSS
												// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only drawer
												<span
													className="sd-entity"
													data-entity={entityName}
													onClick={() => {
														setSelected(entityName);
														setHighlighted(entityName);
														controllerRef.current?.selectFromDrawer(entityName);
													}}
												>
													{entityName}
												</span>
											)}
											<span className="sd-msg">{sd.message}</span>
										</div>
									);
								})
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
