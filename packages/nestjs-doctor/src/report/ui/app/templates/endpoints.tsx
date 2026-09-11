import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import { decodeCodeGraph } from "../../../../common/code-graph-codec.js";
import type { SchemaEntity } from "../../../../common/schema.js";
import { IconButton, TextButton } from "../atoms/button.js";
import { Icon } from "../atoms/icon.js";
import {
	ALL_PRESET,
	buildEndpoints,
	CATEGORIES,
	categoryCounts,
	DATABASE_PRESET,
	type DescentEndpoint,
	type DescentNode,
	type DescentStep,
	dbStepCount,
	defaultPaneMode,
	defaultPreset,
	type Effect,
	type FilterState,
	keptSteps,
	layoutWires,
	type PaneMode,
	PRESETS,
	paneTarget,
	pileItems,
	presetState,
	resolveVisit,
	type StepCategory,
	stepFlags,
	type WireLayout,
} from "../lib/descent-walk.js";
import { useLatest } from "../lib/use-latest.js";
import { CodeViewer } from "../molecules/code-viewer.js";
import { SearchField } from "../molecules/search-field.js";
import { SidebarHeader, TreeToolbar } from "../molecules/sidebar-header.js";
import { TreeRow } from "../molecules/tree-row.js";
import { openSchemaEntity } from "./schema.js";

const KIND_TAG: Record<string, string> = {
	controller: "CTL",
	db: "DB",
	external: "EXT",
	filter: "FLT",
	function: "FN",
	gateway: "GW",
	guard: "GRD",
	interceptor: "INT",
	pipe: "PIPE",
	repository: "REPO",
	resolver: "RES",
	service: "SVC",
	unresolved: "EXT",
};

const EFF_TAG: Record<Effect, string> = {
	external: "EXT",
	plain: "",
	read: "READ",
	throw: "THROW",
	write: "WRITE",
};

const METHOD_COLORS: Record<string, string> = {
	DELETE: "ep-method-delete",
	GET: "ep-method-get",
	PATCH: "ep-method-patch",
	POST: "ep-method-post",
	PUT: "ep-method-put",
};

const SPEEDS = [0.5, 1, 2, 4];
const WIDTH_KEY = "nd.endpoints.codeWidth";
const CODE_WIDTH = 520;
const CODE_MIN = 340;
const BASE_INTERVAL = 820;
const DIV_H = 20;
const GAP = 3;
/** Vertical padding and borders a `.dc-block` spends outside its line boxes. */
const BLOCK_PAD = 18;
const METHOD_LINE = 16;
const META_LINE = 16;
const FLAG_LINE = 17;
/** Above this interval the block flies from its card; below 200ms it snaps. */
const FLY_MS = 500;
const DROP_MS = 200;

function reducedMotion(): boolean {
	return (
		typeof matchMedia === "function" &&
		matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function motionMode(speed: number): "fly" | "drop" | "none" {
	if (reducedMotion()) {
		return "none";
	}
	const interval = BASE_INTERVAL / speed;
	if (interval >= FLY_MS) {
		return "fly";
	}
	return interval >= DROP_MS ? "drop" : "none";
}

function effectOf(endpoint: DescentEndpoint, step: DescentStep): Effect {
	return endpoint.nodes[step.node]?.effect ?? "plain";
}

function methodText(node: DescentNode): string {
	return node.member ? `${node.member}.${node.methodName}` : node.methodName;
}

function blockFlags(endpoint: DescentEndpoint, step: DescentStep): string[] {
	const flags = stepFlags(endpoint, step);
	const dbOp = endpoint.nodes[step.node]?.dbOp;
	return dbOp ? [`db ${dbOp}`, ...flags] : flags;
}

/**
 * The height one block renders at: the method's length over the characters
 * the column fits, plus the meta line and any flag line.
 */
function blockHeight(
	endpoint: DescentEndpoint,
	step: number,
	charW: number,
	innerW: number
): number {
	const walkStep = endpoint.walk[step] as DescentStep;
	const node = endpoint.nodes[walkStep.node];
	const perLine = charW > 0 ? Math.floor(innerW / charW) : 0;
	const chars = node ? methodText(node).length : 0;
	const lines = perLine > 0 ? Math.max(1, Math.ceil(chars / perLine)) : 1;
	const flags = blockFlags(endpoint, walkStep).length > 0 ? FLAG_LINE : 0;
	return BLOCK_PAD + lines * METHOD_LINE + META_LINE + flags;
}

interface PlayState {
	push: boolean;
	step: number | null;
}

/** The node and visit the code pane shows, separate from the playhead. */
interface Selection {
	mode: PaneMode;
	node: number;
	/** The visit being shown, or null when the node is not on the walk. */
	step: number | null;
}

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

function readWidth(): number {
	try {
		const stored = Number(localStorage.getItem(WIDTH_KEY));
		return stored >= CODE_MIN ? stored : CODE_WIDTH;
	} catch {
		return CODE_WIDTH;
	}
}

function storeWidth(width: number): void {
	try {
		localStorage.setItem(WIDTH_KEY, String(width));
	} catch {
		// Storage can be unavailable; the width is then not persisted.
	}
}

/** Drops the scan root prefix; a path that does not carry it is unchanged. */
function relativeTo(root: string | undefined, filePath: string): string {
	if (!(root && filePath.startsWith(`${root}/`))) {
		return filePath;
	}
	return filePath.slice(root.length + 1);
}

/** Elides the middle of a string longer than `max`, keeping both ends. */
function midTruncate(text: string, max = 46): string {
	if (text.length <= max) {
		return text;
	}
	const head = Math.ceil((max - 1) / 2);
	return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`;
}

const VISIT_CHIPS = 4;

function schemaEntity(
	schema: ReportArtifact["schema"],
	member: string | null
): SchemaEntity | undefined {
	// Matches the client accessor to an entity name, case-insensitively.
	const wanted = member?.toLowerCase();
	return wanted
		? schema.entities.find((entity) => entity.name.toLowerCase() === wanted)
		: undefined;
}

function ModelChip({
	entity,
	member,
}: {
	entity: SchemaEntity | undefined;
	member: string;
}) {
	const [open, setOpen] = useState(false);
	if (!entity) {
		return (
			<div className="dc-model" data-empty="1" id="endpoints-model">
				<span className="dc-model-key">model</span>
				<span className="dc-model-name">{member}</span>
				<span className="dc-model-note">not in schema</span>
			</div>
		);
	}
	return (
		<>
			<button
				aria-expanded={open}
				className="dc-model"
				id="endpoints-model"
				onClick={() => setOpen((prev) => !prev)}
				type="button"
			>
				<span className="dc-model-key">model</span>
				<span className="dc-model-name">{entity.name}</span>
				<span className="dc-model-caret">{open ? "\u25be" : "\u25b8"}</span>
			</button>
			{open && (
				<div className="dc-model-body" id="endpoints-model-body">
					{entity.columns.map((column) => (
						<div className="dc-model-col" key={column.name}>
							<span className="dc-model-cn">{column.name}</span>
							<span className="dc-model-ct">{column.type}</span>
							{column.isPrimary && <span className="dc-glyph">pk</span>}
							{column.isUnique && !column.isPrimary && (
								<span className="dc-glyph">uniq</span>
							)}
						</div>
					))}
					{entity.relations.map((relation) => (
						<div
							className="dc-model-col"
							data-rel="1"
							key={`${relation.propertyName}:${relation.toEntity}`}
						>
							<span className="dc-model-cn">{relation.propertyName}</span>
							<span className="dc-model-ct">{`\u2192 ${relation.toEntity}`}</span>
						</div>
					))}
					<button
						className="dc-model-link"
						id="endpoints-model-open"
						onClick={() => {
							(
								globalThis as { switchTab?: (name: string) => void }
							).switchTab?.("schema");
							openSchemaEntity(entity.name);
						}}
						type="button"
					>
						{"view in schema \u25b8"}
					</button>
				</div>
			)}
		</>
	);
}

function VisitStrip({
	endpoint,
	from,
	onPage,
	onPick,
	step,
	visits,
}: {
	endpoint: DescentEndpoint;
	from: number;
	onPage: () => void;
	onPick: (visit: number) => void;
	step: number | null;
	visits: number[];
}) {
	if (visits.length < 2) {
		return null;
	}
	const shown = visits.slice(from, from + VISIT_CHIPS);
	const rest = visits.length - shown.length;
	return (
		<div className="dc-visits" id="endpoints-visits">
			<span className="dc-code-key">visits</span>
			{shown.map((visit) => {
				const edge = endpoint.edges[endpoint.walk[visit]?.edge ?? -1];
				const caller = edge ? endpoint.nodes[edge.from] : undefined;
				const file = caller?.filePath.split("/").pop() ?? "";
				return (
					<button
						aria-pressed={visit === step}
						className="dc-visit"
						key={visit}
						onClick={() => onPick(visit)}
						title={edge ? `line ${edge.line} \u00b7 ${file}` : undefined}
						type="button"
					>
						{`@${visit}`}
					</button>
				);
			})}
			{rest > 0 && (
				<button
					className="dc-visit"
					data-more="1"
					id="endpoints-visits-more"
					onClick={onPage}
					title="show the next visits"
					type="button"
				>
					{`+${rest}`}
				</button>
			)}
		</div>
	);
}

function CodePane({
	endpoint,
	mode,
	node,
	onClose,
	onMode,
	onResize,
	onVisit,
	report,
	step,
}: {
	endpoint: DescentEndpoint;
	mode: PaneMode;
	node: number;
	onClose: () => void;
	onMode: (mode: PaneMode) => void;
	onResize: (width: number) => void;
	onVisit: (visit: number) => void;
	report: ReportArtifact;
	step: number | null;
}) {
	const paneRef = useRef<HTMLDivElement>(null);
	const [page, setPage] = useState(0);
	const gripRef = useRef<HTMLDivElement>(null);
	const resize = useLatest(onResize);
	const close = useLatest(onClose);

	// Drags the pane's width, reported from the pane's own offsetWidth, and
	// releases the body cursor and selection on release or unmount.
	useEffect(() => {
		const grip = gripRef.current;
		const pane = paneRef.current;
		if (!(grip && pane)) {
			return;
		}
		let dragging = false;
		let startX = 0;
		let startW = 0;
		const onDown = (e: MouseEvent) => {
			dragging = true;
			startX = e.clientX;
			startW = pane.offsetWidth;
			grip.classList.add("dragging");
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			e.preventDefault();
		};
		const onMove = (e: MouseEvent) => {
			if (dragging) {
				resize.current(startW + e.clientX - startX);
			}
		};
		const onUp = () => {
			if (!dragging) {
				return;
			}
			dragging = false;
			grip.classList.remove("dragging");
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
		grip.addEventListener("mousedown", onDown);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			onUp();
			grip.removeEventListener("mousedown", onDown);
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [resize]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				close.current();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [close]);

	const own = endpoint.nodes[node] as DescentNode;
	const sources = report.sources ?? {};
	const visits = endpoint.stepsOf[node] ?? [];

	// Falls back to the declaration when the wanted target has no source.
	const wanted = paneTarget(endpoint, node, step, mode);
	const declined = paneTarget(endpoint, node, step, "decl");
	let target = wanted;
	if (!(wanted && sources[wanted.file]) && declined && sources[declined.file]) {
		target = declined;
	}
	const shown = target ? endpoint.nodes[target.shownNode] : undefined;
	const source = target ? sources[target.file] : undefined;

	const range = target?.range;
	const rangeLines = range
		? Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i)
		: [];
	const hit = target?.callLine ?? null;
	// The call line leads and appears once; the viewer scrolls to the first.
	const highlightLines =
		hit === null
			? rangeLines
			: [hit, ...rangeLines.filter((line) => line !== hit)];

	const canToggle = Boolean(sources[own.filePath]) && own.dbOp === null;
	const calleeTag = own.dbOp
		? `db ${own.dbOp}`
		: (EFF_TAG[own.effect] || KIND_TAG[own.kind] || own.kind).toLowerCase();
	const path = target ? relativeTo(report.root, target.file) : "";

	return (
		<div className="dc-code" ref={paneRef}>
			<div className="dc-code-head">
				<div className="dc-code-top">
					<div className="dc-code-path" title={target?.file}>
						{midTruncate(path)}
					</div>
					<TextButton
						classes="dc-code-back"
						id="endpoints-code-back"
						onClick={onClose}
					>
						{"\u25c2 ROUTES"}
					</TextButton>
				</div>
				<div className="dc-code-name">
					<span className="dc-code-cls">{shown?.className || "\u0192"}</span>
					<span className="dc-code-m">
						{shown ? `#${methodText(shown)}` : ""}
					</span>
				</div>
				{hit !== null && (
					<div className="dc-code-callee" id="endpoints-callee">
						<span className="dc-code-arrow">{"\u2192"}</span>
						<span className="dc-code-callee-n">
							{`${own.className || "\u0192"}.${methodText(own)}`}
						</span>
						<span
							className="dc-tag"
							data-eff={own.effect === "plain" ? undefined : own.effect}
						>
							{calleeTag}
						</span>
					</div>
				)}
				<VisitStrip
					endpoint={endpoint}
					from={page}
					onPage={() =>
						setPage((prev) =>
							prev + VISIT_CHIPS >= visits.length ? 0 : prev + VISIT_CHIPS
						)
					}
					onPick={onVisit}
					step={step}
					visits={visits}
				/>
				{canToggle && (
					<div className="dc-code-modes" id="endpoints-modes">
						<button
							aria-pressed={mode === "decl"}
							className="dc-visit"
							id="endpoints-mode-decl"
							onClick={() => onMode("decl")}
							type="button"
						>
							decl
						</button>
						<button
							aria-pressed={mode === "call"}
							className="dc-visit"
							id="endpoints-mode-call"
							onClick={() => onMode("call")}
							type="button"
						>
							call
						</button>
					</div>
				)}
			</div>
			{own.dbOp !== null && (
				<ModelChip
					entity={schemaEntity(report.schema, own.member)}
					member={own.member ?? own.methodName}
				/>
			)}
			<div className="dc-code-body" id="endpoints-code-body">
				{source ? (
					<>
						{highlightLines.length === 0 && (
							<div className="dc-code-note" id="endpoints-code-note">
								no declaration range for this node
							</div>
						)}
						<CodeViewer
							code={source}
							options={{
								firstLineNumber: 1,
								highlightLines,
								hitLines: hit === null ? [] : [hit],
							}}
						/>
					</>
				) : (
					<div className="dc-code-none" id="endpoints-code-none">
						<b>{relativeTo(report.root, own.filePath) || "this node"}</b>
						{shown
							? `${shown.className || "This function"}'s source is not in this report.`
							: "The source of this file is not in this report."}
						{
							" It sits outside the scan, or the report was written with --sources none."
						}
					</div>
				)}
			</div>
			<div className="dc-code-grip" id="endpoints-code-grip" ref={gripRef} />
		</div>
	);
}

function DepthCard({
	endpoint,
	index,
	live,
	onPick,
	refFor,
	selected,
	shown,
}: {
	endpoint: DescentEndpoint;
	index: number;
	live: boolean;
	onPick: (node: number) => void;
	refFor: (el: HTMLButtonElement | null) => void;
	selected: boolean;
	shown: boolean;
}) {
	const node = endpoint.nodes[index];
	const steps = endpoint.stepsOf[index] ?? [];
	if (!node) {
		return null;
	}
	const isEntry = node.depth === 0;
	const tag = EFF_TAG[node.effect] || KIND_TAG[node.kind] || node.kind;
	const stamp =
		steps.length > 0
			? steps.map((step) => `@${step}`).join(" ")
			: "not on the walk";
	return (
		<button
			className="dc-card"
			data-dimmed={shown ? "0" : "1"}
			data-entry={isEntry ? "1" : undefined}
			data-sel={selected ? "1" : undefined}
			data-step={live ? "1" : "0"}
			onClick={() => onPick(index)}
			ref={refFor}
			title={`${node.label}  ·  ${node.filePath}`}
			type="button"
		>
			<span className="dc-card-l1">
				<span className="dc-card-cls">{node.className || "ƒ"}</span>
				<span className="dc-card-d">d{node.depth}</span>
			</span>
			<span className="dc-card-l2">
				<span className="dc-card-m">{methodText(node)}</span>
				<span
					className="dc-tag"
					data-eff={node.effect === "plain" ? undefined : node.effect}
				>
					{tag}
				</span>
			</span>
			<span className="dc-card-steps" data-off={steps.length ? undefined : "1"}>
				{steps.length > 1 && <b>{`×${steps.length} `}</b>}
				{stamp}
			</span>
			{isEntry && <span className="dc-card-entry">ENTRY</span>}
		</button>
	);
}

function DepthMap({
	endpoint,
	kept,
	live,
	onPick,
	selected,
}: {
	endpoint: DescentEndpoint;
	kept: boolean[];
	live: number | null;
	onPick: (node: number) => void;
	selected: number | null;
}) {
	const mapRef = useRef<HTMLDivElement>(null);
	const colsRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [wires, setWires] = useState<(WireLayout & { width: number }) | null>(
		null
	);

	useLayoutEffect(() => {
		const measure = () => {
			const cols = colsRef.current;
			if (!cols) {
				return;
			}
			const boxes = endpoint.nodes.map((_, index) => {
				const el = cardRefs.current[index];
				return el
					? {
							h: el.offsetHeight,
							w: el.offsetWidth,
							x: el.offsetLeft,
							y: el.offsetTop,
						}
					: null;
			});
			setWires({ ...layoutWires(endpoint, boxes), width: cols.scrollWidth });
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [endpoint]);

	const liveNodes = new Set<number>();
	for (const [index, step] of endpoint.walk.entries()) {
		if (kept[index]) {
			liveNodes.add(step.node);
		}
	}
	const liveEdge = live === null ? -1 : (endpoint.walk[live]?.edge ?? -1);
	const liveNode = live === null ? -1 : (endpoint.walk[live]?.node ?? -1);

	const reveal = useLatest((index: number) => {
		const map = mapRef.current;
		const card = cardRefs.current[index];
		if (!(map && card)) {
			return;
		}
		const box = map.getBoundingClientRect();
		const rect = card.getBoundingClientRect();
		if (rect.top < box.top + 4 || rect.bottom > box.bottom - 4) {
			map.scrollTop += rect.top - box.top - (box.height - rect.height) / 2;
		}
		if (rect.left < box.left + 4 || rect.right > box.right - 4) {
			map.scrollLeft += rect.left - box.left - (box.width - rect.width) / 2;
		}
	});

	// Scrolls the playhead's card into view, without animating the jump.
	useEffect(() => {
		reveal.current(liveNode);
	}, [liveNode, reveal]);

	// Scrolls the selected card into view.
	useEffect(() => {
		if (selected !== null) {
			reveal.current(selected);
		}
	}, [selected, reveal]);

	return (
		<div className="dc-map" ref={mapRef}>
			<div
				className="dc-cols"
				ref={colsRef}
				style={{ paddingBottom: wires?.padBottom }}
			>
				{wires && (
					<svg
						aria-hidden="true"
						className="dc-wires"
						height={wires.height}
						viewBox={`0 0 ${wires.width} ${wires.height}`}
						width={wires.width}
					>
						<title>call sites</title>
						{wires.wires.map((wire) => {
							const eff = wire.effect === "plain" ? undefined : wire.effect;
							const isLive = wire.edge === liveEdge ? "1" : undefined;
							const edge = endpoint.edges[wire.edge];
							const isSel =
								selected !== null &&
								(edge?.from === selected || edge?.to === selected)
									? "1"
									: undefined;
							return (
								<g key={wire.edge}>
									<path
										className="dc-wire"
										d={wire.path}
										data-eff={eff}
										data-live={isLive}
										data-sel={isSel}
										strokeDasharray={wire.dash}
									/>
									{wire.twin && (
										<path
											className="dc-wire"
											d={wire.path}
											data-eff={eff}
											data-live={isLive}
											data-sel={isSel}
											strokeDasharray={wire.dash}
											transform="translate(0,2.4)"
										/>
									)}
									<path
										className="dc-wire-head"
										d="M0 0 L-7 -3.4 L-7 3.4 Z"
										data-eff={eff}
										data-live={isLive}
										data-sel={isSel}
										transform={wire.head}
									/>
								</g>
							);
						})}
					</svg>
				)}
				{endpoint.tiers.map((tier, column) => (
					<div className="dc-col" key={endpoint.depths[column]}>
						<div className="dc-col-head">
							<div className="dc-col-depth">
								d{endpoint.depths[column]}
								<span>{`${tier.length} node${tier.length === 1 ? "" : "s"}`}</span>
							</div>
						</div>
						{tier.map((index) => (
							<DepthCard
								endpoint={endpoint}
								index={index}
								key={endpoint.nodes[index]?.id}
								live={index === liveNode}
								onPick={onPick}
								refFor={(el) => {
									cardRefs.current[index] = el;
								}}
								selected={index === selected}
								shown={liveNodes.has(index)}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

function BlockFace({
	endpoint,
	step,
}: {
	endpoint: DescentEndpoint;
	step: number;
}) {
	const walkStep = endpoint.walk[step] as DescentStep;
	const node = endpoint.nodes[walkStep.node];
	if (!node) {
		return null;
	}
	const effect = node.effect === "plain" ? undefined : node.effect;
	const flags = blockFlags(endpoint, walkStep);
	return (
		<>
			<span className="dc-block-m">{methodText(node)}</span>
			<span className="dc-block-l2">
				<span className="dc-block-cls">{node.className || "ƒ"}</span>
				<span className="dc-block-kind">
					{KIND_TAG[node.kind] ?? node.kind}
				</span>
				{effect && (
					<span className="dc-block-eff" data-eff={effect}>
						{EFF_TAG[node.effect]}
					</span>
				)}
				<span className="dc-block-at dc-block-d">d{walkStep.depth}</span>
				<span className="dc-block-at">@{step}</span>
			</span>
			{flags.length > 0 && (
				<span className="dc-block-flags">
					{flags.map((flag) => (
						<span className="dc-glyph" key={flag}>
							{flag}
						</span>
					))}
				</span>
			)}
		</>
	);
}

function ExecutionPile({
	endpoint,
	kept,
	onSeek,
	onSelect,
	play,
	selected,
	speed,
}: {
	endpoint: DescentEndpoint;
	kept: boolean[];
	onSeek: (step: number) => void;
	onSelect: (step: number) => void;
	play: PlayState;
	selected: number | null;
	speed: number;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const topRef = useRef<HTMLButtonElement>(null);
	const [viewH, setViewH] = useState(400);
	const [box, setBox] = useState({ charW: 0, innerW: 0 });
	const [scrollTop, setScrollTop] = useState(0);

	// Re-measures the block face and the column off the scroller on any resize.
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}
		const measure = () => {
			setViewH(el.clientHeight || 400);
			const probe = document.createElement("div");
			probe.className = "dc-block";
			probe.style.cssText = "visibility:hidden;height:0";
			const face = document.createElement("span");
			face.className = "dc-block-m";
			face.style.cssText = "position:absolute;white-space:pre";
			face.textContent = "0".repeat(40);
			probe.append(face);
			el.append(probe);
			const pad = getComputedStyle(probe);
			setBox({
				charW: face.offsetWidth / 40,
				innerW:
					probe.clientWidth -
					(Number.parseFloat(pad.paddingLeft) || 0) -
					(Number.parseFloat(pad.paddingRight) || 0),
			});
			probe.remove();
		};
		measure();
		if (typeof ResizeObserver !== "function") {
			window.addEventListener("resize", measure);
			return () => window.removeEventListener("resize", measure);
		}
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const items = useMemo(
		() => (play.step === null ? [] : pileItems(kept, play.step)),
		[kept, play.step]
	);
	const heights = useMemo(
		() =>
			items.map((item) =>
				item.hidden
					? DIV_H
					: blockHeight(endpoint, item.step as number, box.charW, box.innerW)
			),
		[box.charW, box.innerW, endpoint, items]
	);
	const offsets = useMemo(() => {
		const out = [0];
		for (const height of heights) {
			out.push((out.at(-1) as number) + height + GAP);
		}
		return out;
	}, [heights]);

	const total = (offsets.at(-1) as number) - (items.length > 0 ? GAP : 0);
	const pad = Math.max(0, viewH - total);
	const mode = motionMode(speed);

	// The first and last rows inside the scroll port, so only those render.
	const from = Math.max(
		0,
		offsets.findIndex((off) => off >= scrollTop - pad) - 2
	);
	let to = items.length;
	for (let i = from; i < items.length; i++) {
		if ((offsets[i] as number) > scrollTop - pad + viewH) {
			to = i + 1;
			break;
		}
	}

	// The first row below the top that is a block, not a hidden-run divider.
	const underIndex = items.findIndex(
		(item, index) => index > 0 && item.step !== undefined
	);

	// Clones the top block onto the body and flies it in from the lit card.
	useEffect(() => {
		const block = topRef.current;
		// A hidden tab never ticks a CSS animation, so animationend never fires.
		if (!(play.push && mode === "fly" && block) || document.hidden) {
			return;
		}
		const to2 = block.getBoundingClientRect();
		if (!to2.width) {
			return;
		}
		const ghost = block.cloneNode(true) as HTMLElement;
		ghost.className = "dc-block dc-ghost";
		ghost.style.top = `${to2.top}px`;
		ghost.style.left = `${to2.left}px`;
		ghost.style.width = `${to2.width}px`;
		ghost.style.height = `${to2.height}px`;
		ghost.style.right = "auto";
		const card = document.querySelector<HTMLElement>('.dc-card[data-step="1"]');
		const rect = card?.getBoundingClientRect();
		const onScreen = Boolean(
			rect && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight
		);
		const dx =
			onScreen && rect
				? Math.round(rect.left + rect.width / 2 - (to2.left + to2.width / 2))
				: -260;
		const dy =
			onScreen && rect
				? Math.round(rect.top + rect.height / 2 - (to2.top + to2.height / 2))
				: -120;
		ghost.style.setProperty("--dc-fx", `${dx}px`);
		ghost.style.setProperty("--dc-fy", `${dy}px`);
		ghost.style.setProperty("--dc-mx", `${Math.round(dx * 0.5)}px`);
		ghost.style.setProperty("--dc-my", `${Math.min(dy, 0) - 80}px`);
		ghost.addEventListener("animationend", () => ghost.remove());
		document.body.append(ghost);
		return () => ghost.remove();
	}, [mode, play.push, play.step]);

	const dbSteps = dbStepCount(endpoint);

	return (
		<>
			<div className="dc-pile-head">
				<span className="dc-pile-title">Pile</span>
				<span className="dc-pile-stat" id="endpoints-pile-stat">
					{play.step === null
						? `${endpoint.walk.length} steps · ${dbSteps} db`
						: `${items.length} blocks · top @${play.step}`}
				</span>
			</div>
			<div
				className="dc-pile-scroll"
				onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
				ref={scrollRef}
			>
				<div
					className="dc-pile-body"
					data-motion={mode}
					style={{ height: Math.max(total, viewH) }}
				>
					{items.slice(from, to).map((item, offset) => {
						const index = from + offset;
						const top = pad + (offsets[index] as number);
						if (item.hidden) {
							return (
								<div
									className="dc-pile-div"
									key={`h${index}:${play.step}`}
									style={{ top }}
								>
									{`··· ${item.hidden} hidden`}
								</div>
							);
						}
						const step = item.step as number;
						const isTop = index === 0;
						const isUnder = index === underIndex;
						const animates = play.push && mode !== "none";
						const classes = [
							"dc-block",
							animates && isTop ? "dc-land dc-bar-in" : undefined,
							animates && isUnder ? "dc-impact dc-bar-out" : undefined,
						]
							.filter(Boolean)
							.join(" ");
						const effect = effectOf(
							endpoint,
							endpoint.walk[step] as DescentStep
						);
						return (
							<button
								className={classes}
								data-eff={effect === "plain" ? undefined : effect}
								data-sel={step === selected ? "1" : undefined}
								data-top={isTop ? "1" : undefined}
								key={isTop || isUnder ? `${step}:${play.step}` : step}
								onClick={() => onSelect(step)}
								ref={isTop ? topRef : undefined}
								style={{ height: heights[index], top }}
								type="button"
							>
								<BlockFace endpoint={endpoint} step={step} />
							</button>
						);
					})}
				</div>
			</div>
			<details className="dc-steps">
				<summary>{`All steps · ${endpoint.walk.length} in walk order`}</summary>
				<div className="dc-step-box">
					{endpoint.walk.map((step, index) => {
						const node = endpoint.nodes[step.node];
						return (
							<button
								className="dc-step-row"
								data-step={play.step === index ? "1" : "0"}
								key={`${index}:${node?.id}`}
								onClick={() => onSeek(index)}
								type="button"
							>
								<span className="dc-step-n">{index}</span>
								<span className="dc-step-flags">
									<span
										className="dc-step-name"
										style={{ paddingLeft: Math.min(step.depth, 9) * 8 }}
									>
										{node?.label}
									</span>
									{stepFlags(endpoint, step).map((flag) => (
										<span className="dc-glyph" key={flag}>
											{flag}
										</span>
									))}
								</span>
							</button>
						);
					})}
				</div>
			</details>
		</>
	);
}

function verdictFirst(endpoint: DescentEndpoint): string | undefined {
	const { firstRead, firstWrite } = endpoint.verdict;
	if (firstRead === -1 && firstWrite === -1) {
		return undefined;
	}
	if (firstWrite === -1 || (firstRead !== -1 && firstRead < firstWrite)) {
		return "read";
	}
	return "write";
}

function RouteRail({
	endpoints,
	onHide,
	onSelect,
	selected,
}: {
	endpoints: DescentEndpoint[];
	onHide: () => void;
	onSelect: (index: number) => void;
	selected: number;
}) {
	const [query, setQuery] = useState("");
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
	const needle = query.trim().toLowerCase();

	const groups: { controller: string; routes: number[] }[] = [];
	const byName = new Map<string, { controller: string; routes: number[] }>();
	for (const [index, endpoint] of endpoints.entries()) {
		const haystack =
			`${endpoint.httpMethod} ${endpoint.routePath} ${endpoint.controllerClass}`.toLowerCase();
		if (needle && !haystack.includes(needle)) {
			continue;
		}
		let group = byName.get(endpoint.controllerClass);
		if (!group) {
			group = { controller: endpoint.controllerClass, routes: [] };
			byName.set(endpoint.controllerClass, group);
			groups.push(group);
		}
		group.routes.push(index);
	}

	return (
		<>
			<div className="endpoints-sidebar-sticky">
				<SidebarHeader
					classes="endpoints-sidebar-header"
					count={endpoints.length}
					countId="endpoints-count"
					title="Endpoints"
					toolbar={
						<TreeToolbar
							noun="controller"
							onCollapseAll={() =>
								setClosed(new Set(groups.map((g) => g.controller)))
							}
							onExpandAll={() => setClosed(new Set())}
							onHide={onHide}
							prefix="endpoints"
							subject="walk"
						/>
					}
				/>
				<SearchField
					id="endpoints-search"
					onChange={setQuery}
					placeholder="Filter routes and controllers"
					value={query}
				/>
			</div>
			<div id="endpoints-list">
				{groups.map((group) => {
					const open = !closed.has(group.controller);
					return (
						<div key={group.controller} style={{ display: "contents" }}>
							<TreeRow
								depth={0}
								extra={<span className="st-count">{group.routes.length}</span>}
								icon={<Icon name="controller" />}
								label={
									<span className="st-entity-name">{group.controller}</span>
								}
								onToggle={() =>
									setClosed((prev) => {
										const next = new Set(prev);
										if (!next.delete(group.controller)) {
											next.add(group.controller);
										}
										return next;
									})
								}
								toggleGlyph={open ? "▾" : "▸"}
							/>
							<div className={open ? "st-children st-open" : "st-children"}>
								{group.routes.map((index) => {
									const endpoint = endpoints[index] as DescentEndpoint;
									const classes =
										index === selected
											? "ep-endpoint-row st-selected"
											: "ep-endpoint-row";
									return (
										<div key={endpoint.key}>
											<TreeRow
												before={
													<span
														className={`ep-method-badge ${METHOD_COLORS[endpoint.httpMethod] ?? "ep-method-get"}`}
													>
														{endpoint.httpMethod}
													</span>
												}
												classes={classes}
												depth={1}
												label={endpoint.routePath}
												onClick={() => onSelect(index)}
											/>
											<div
												className="dc-route-verdict"
												data-first={verdictFirst(endpoint)}
											>
												{endpoint.verdict.text}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}

export function EndpointsTab({ report }: { report: ReportArtifact }) {
	const endpoints = useMemo(
		() =>
			report.codeGraph ? buildEndpoints(decodeCodeGraph(report.codeGraph)) : [],
		[report]
	);
	const [selected, setSelected] = useState(0);
	const [sideHidden, setSideHidden] = useState(false);
	const [sourceTarget, setSourceTarget] = useState<Selection | null>(null);
	const [codeWidth, setCodeWidth] = useState(readWidth);
	const [presetIndex, setPresetIndex] = useState(ALL_PRESET);
	const [filter, setFilter] = useState<FilterState>(() =>
		presetState(ALL_PRESET)
	);
	const [showCats, setShowCats] = useState(false);
	const [play, setPlay] = useState<PlayState>({ push: false, step: null });
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);

	const endpoint = endpoints[selected];
	const keptList = useMemo(
		() => (endpoint ? keptSteps(endpoint, filter) : []),
		[endpoint, filter]
	);
	// The same steps as flags indexed by walk position.
	const kept = useMemo(() => {
		const flags = new Array<boolean>(endpoint?.walk.length ?? 0).fill(false);
		for (const index of keptList) {
			flags[index] = true;
		}
		return flags;
	}, [endpoint, keptList]);
	const counts = useMemo(
		() =>
			endpoint
				? categoryCounts(endpoint)
				: ({} as ReturnType<typeof categoryCounts>),
		[endpoint]
	);

	const goTo = (step: number | null, push: boolean) => setPlay({ push, step });

	// Selects a node for the code pane, leaving the playhead where it is.
	const select = (node: number, step?: number) => {
		setPlaying(false);
		track("endpoint_code_opened");
		const target = endpoint?.nodes[node];
		setSourceTarget({
			mode: target ? defaultPaneMode(target) : "decl",
			node,
			step: endpoint ? resolveVisit(endpoint, node, step, play.step) : null,
		});
	};

	// Moves the playhead to one step and selects the node it lands on.
	const seekTo = (step: number) => {
		goTo(step, false);
		select(endpoint?.walk[step]?.node ?? 0, step);
	};

	const resizeCode = (width: number) => {
		const ceiling = Math.max(window.innerWidth * 0.72, CODE_MIN);
		setCodeWidth(Math.round(Math.min(Math.max(width, CODE_MIN), ceiling)));
	};

	useEffect(() => {
		storeWidth(codeWidth);
	}, [codeWidth]);

	// Reads the step off the previous state, so queued presses each move one.
	const stepBy = (direction: 1 | -1) => {
		if (keptList.length === 0) {
			setPlaying(false);
			return;
		}
		setPlay((prev) => {
			if (prev.step === null) {
				return {
					push: direction > 0,
					step: (direction > 0 ? keptList[0] : keptList.at(-1)) as number,
				};
			}
			for (
				let k = prev.step + direction;
				k >= 0 && k < kept.length;
				k += direction
			) {
				if (kept[k]) {
					return { push: direction > 0, step: k };
				}
			}
			return prev;
		});
	};

	// Re-applies the default preset whenever the selected route changes.
	useEffect(() => {
		const chosen = endpoints[selected];
		if (!chosen) {
			return;
		}
		const index = defaultPreset(chosen);
		setPresetIndex(index);
		setFilter(presetState(index));
	}, [endpoints, selected]);

	// Stops playing once the playhead reaches the last kept step.
	useEffect(() => {
		if (playing && play.step !== null && play.step >= (keptList.at(-1) ?? -1)) {
			setPlaying(false);
		}
	}, [keptList, play.step, playing]);

	// The playhead's timer, ticking at `BASE_INTERVAL` over the chosen speed.
	const advance = useLatest(() => stepBy(1));
	useEffect(() => {
		if (!playing) {
			return;
		}
		const timer = setInterval(() => advance.current(), BASE_INTERVAL / speed);
		return () => clearInterval(timer);
	}, [advance, playing, speed]);

	if (!report.codeGraph || endpoints.length === 0) {
		return (
			<div className="dc-empty">
				No code graph in this report, so there is no descent to walk.
			</div>
		);
	}
	if (!endpoint) {
		return <div className="dc-empty">No route selected.</div>;
	}

	const applyPreset = (index: number) => {
		setPresetIndex(index);
		setFilter(presetState(index));
		setPlay({ push: false, step: null });
		setPlaying(false);
	};
	const toggleCategory = (cat: StepCategory) => {
		setPresetIndex(-1);
		setFilter((prev) => {
			const cats = new Set(prev.cats);
			if (!cats.delete(cat)) {
				cats.add(cat);
			}
			return { ...prev, cats };
		});
	};

	const current = play.step === null ? null : endpoint.walk[play.step];
	const currentNode = current ? endpoint.nodes[current.node] : undefined;
	const currentFlags = current ? stepFlags(endpoint, current) : [];
	const sourceNode =
		sourceTarget === null ? undefined : endpoint.nodes[sourceTarget.node];
	const railHidden = sideHidden && !sourceNode;
	const viewClasses = ["dc-view", railHidden ? "dc-side-hidden" : undefined]
		.filter(Boolean)
		.join(" ");
	// Widens the first column to the code pane's width and shrinks the pile.
	const viewStyle = sourceNode
		? {
				gridTemplateColumns: `min(${codeWidth}px, var(--dc-code-max)) minmax(0, 1fr) var(--dc-code-pile)`,
			}
		: undefined;
	const dbSteps = dbStepCount(endpoint);
	const steps = `${endpoint.walk.length} step${endpoint.walk.length === 1 ? "" : "s"}`;
	let defaultNote = `default: all — ${steps}`;
	if (defaultPreset(endpoint) === DATABASE_PRESET) {
		defaultNote = `default: database — ${steps}, ${dbSteps} db`;
	} else if (dbSteps === 0 && endpoint.walk.length > 1) {
		defaultNote = `default: all — ${steps}, no db`;
	}
	const disabled = keptList.length === 0;

	return (
		<div className={viewClasses} style={viewStyle}>
			<div data-code={sourceNode ? "1" : undefined} id="endpoints-sidebar">
				{sourceNode ? (
					<CodePane
						endpoint={endpoint}
						key={sourceTarget?.node}
						mode={sourceTarget?.mode ?? "decl"}
						node={sourceTarget?.node ?? 0}
						onClose={() => setSourceTarget(null)}
						onMode={(mode) =>
							setSourceTarget((prev) => (prev ? { ...prev, mode } : prev))
						}
						onResize={resizeCode}
						onVisit={(visit) =>
							setSourceTarget((prev) =>
								prev ? { ...prev, step: visit } : prev
							)
						}
						report={report}
						step={sourceTarget?.step ?? null}
					/>
				) : (
					<RouteRail
						endpoints={endpoints}
						onHide={() => setSideHidden(true)}
						onSelect={(index) => {
							setSelected(index);
							setSourceTarget(null);
							setPlay({ push: false, step: null });
							setPlaying(false);
						}}
						selected={selected}
					/>
				)}
			</div>
			<div id="endpoints-main">
				{sideHidden && (
					<div className="dc-side-show">
						<IconButton
							ariaLabel="Show the route list"
							icon="sidebarShow"
							id="endpoints-sidebar-show"
							modifier="schema-diagram-btn"
							onClick={() => setSideHidden(false)}
							tip="Show list · bring the route list back"
						/>
					</div>
				)}
				<div className="dc-head">
					<div className="dc-head-name" id="endpoints-route-name">
						<em>{endpoint.httpMethod}</em>
						{endpoint.routePath}
					</div>
					<div className="dc-spacer" />
					<span className="dc-badge">{`${endpoint.nodes.length} nodes`}</span>
					<span className="dc-badge">{`${endpoint.walk.length} steps`}</span>
					<span className="dc-badge">{`${endpoint.depths.length} depth tiers`}</span>
					{endpoint.truncated && (
						<span className="dc-badge">walk truncated</span>
					)}
				</div>
				<div className="dc-verdict">
					<span className="dc-verdict-key">database</span>
					<span className="dc-verdict-text" data-first={verdictFirst(endpoint)}>
						{endpoint.verdict.text}
					</span>
					<span className="dc-verdict-counts">
						{`${endpoint.verdict.reads} read · ${endpoint.verdict.writes} write${
							endpoint.verdict.other > 0
								? ` · ${endpoint.verdict.other} other`
								: ""
						}`}
					</span>
				</div>
				<div className="dc-filter">
					<div className="dc-filter-row">
						<span className="dc-filter-label">preset</span>
						{PRESETS.map((preset, index) => (
							<button
								aria-pressed={index === presetIndex}
								className="dc-chip"
								key={preset.label}
								onClick={() => applyPreset(index)}
								title={preset.tip}
								type="button"
							>
								{preset.label}
							</button>
						))}
						<button
							aria-expanded={showCats}
							className="dc-chip"
							id="endpoints-more-filters"
							onClick={() => setShowCats((prev) => !prev)}
							title="per-category chips"
							type="button"
						>
							⋯
						</button>
						<span className="dc-verdict-counts" id="endpoints-default-note">
							{defaultNote}
						</span>
						<span className="dc-verdict-counts">
							{`${keptList.length} of ${endpoint.walk.length} steps kept`}
						</span>
					</div>
					{showCats && (
						<div className="dc-filter-row">
							<span className="dc-filter-label">show</span>
							{CATEGORIES.map((cat) => (
								<button
									aria-pressed={filter.cats.has(cat)}
									className="dc-chip"
									data-zero={counts[cat] ? "0" : "1"}
									key={cat}
									onClick={() => toggleCategory(cat)}
									type="button"
								>
									{cat}
									<span className="dc-chip-n">{counts[cat]}</span>
								</button>
							))}
							<button
								aria-pressed={filter.guard}
								className="dc-chip"
								data-overlay="1"
								onClick={() => {
									setPresetIndex(-1);
									setFilter((prev) => ({ ...prev, guard: !prev.guard }));
								}}
								title="overlay: also keep any step whose call site carries a guard throw"
								type="button"
							>
								guard
								<span className="dc-chip-n">{counts.guard}</span>
							</button>
							<button
								aria-pressed={filter.db}
								className="dc-chip"
								data-overlay="1"
								onClick={() => {
									setPresetIndex(-1);
									setFilter((prev) => ({ ...prev, db: !prev.db }));
								}}
								title="overlay: also keep any step that lands on a db node"
								type="button"
							>
								db
								<span className="dc-chip-n">{counts.db}</span>
							</button>
						</div>
					)}
				</div>
				<div className="dc-map-wrap">
					<div className="dc-map-head">
						<span className="dc-map-title">Depth tiers</span>
						<span className="dc-map-note">
							{`${endpoint.depths.length} tier${endpoint.depths.length === 1 ? "" : "s"} · ${endpoint.nodes.length} nodes · columns are call depth, not order · source order of call sites walked depth-first, not a runtime trace`}
						</span>
					</div>
					<div className="dc-player">
						<button
							className="dc-btn"
							disabled={disabled}
							id="endpoints-prev"
							onClick={() => {
								setPlaying(false);
								stepBy(-1);
							}}
							type="button"
						>
							◀ Prev
						</button>
						<button
							aria-pressed={playing}
							className="dc-btn"
							disabled={disabled || reducedMotion()}
							id="endpoints-play"
							onClick={() => setPlaying((prev) => !prev)}
							type="button"
						>
							{playing ? "Pause" : "▶ Play"}
						</button>
						<button
							className="dc-btn"
							disabled={disabled}
							id="endpoints-next"
							onClick={() => {
								setPlaying(false);
								stepBy(1);
							}}
							type="button"
						>
							Next ▶
						</button>
						<span className="dc-step-num" id="endpoints-step-num">
							{play.step === null ? "—" : play.step}
							<small>{` / ${endpoint.walk.length - 1}`}</small>
						</span>
						<span className="dc-step-label">
							{currentNode ? (
								<b>{currentNode.label}</b>
							) : (
								`press Play to walk ${endpoint.walk.length} steps in execution order`
							)}
							{currentFlags.length > 0
								? `  ·  ${currentFlags.join(" · ")}`
								: ""}
						</span>
						<span className="dc-speed">
							{SPEEDS.map((value) => (
								<button
									aria-pressed={value === speed}
									className="dc-btn"
									key={value}
									onClick={() => setSpeed(value)}
									type="button"
								>
									{value}×
								</button>
							))}
						</span>
						<button
							className="dc-btn"
							onClick={() => {
								setPlaying(false);
								setPlay({ push: false, step: null });
							}}
							type="button"
						>
							Reset
						</button>
						<span className="dc-track">
							<i
								style={{
									width: `${
										play.step === null || endpoint.walk.length < 2
											? 0
											: (play.step / (endpoint.walk.length - 1)) * 100
									}%`,
								}}
							/>
						</span>
					</div>
					<DepthMap
						endpoint={endpoint}
						kept={kept}
						live={play.step}
						onPick={select}
						selected={sourceTarget?.node ?? null}
					/>
				</div>
			</div>
			<div id="endpoints-pile">
				<ExecutionPile
					endpoint={endpoint}
					kept={kept}
					onSeek={seekTo}
					onSelect={(step) =>
						select((endpoint.walk[step] as DescentStep).node, step)
					}
					play={play}
					selected={sourceTarget?.step ?? null}
					speed={speed}
				/>
			</div>
		</div>
	);
}
