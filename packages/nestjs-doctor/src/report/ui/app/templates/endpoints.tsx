import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import { decodeCodeGraph } from "../../../../common/code-graph-codec.js";
import { IconButton } from "../atoms/button.js";
import { Icon } from "../atoms/icon.js";
import {
	buildEndpoints,
	CATEGORIES,
	categoryCounts,
	type DescentEndpoint,
	type DescentStep,
	type Effect,
	type FilterState,
	keptSteps,
	layoutWires,
	PRESETS,
	pileItems,
	presetState,
	type StepCategory,
	stepFlags,
	type Wire,
} from "../lib/descent-walk.js";
import { useLatest } from "../lib/use-latest.js";
import { SearchField } from "../molecules/search-field.js";
import { SidebarHeader, TreeToolbar } from "../molecules/sidebar-header.js";
import { TreeRow } from "../molecules/tree-row.js";

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
const BASE_INTERVAL = 820;
const BLOCK_H = 46;
const PITCH = 49;
const DIV_H = 20;
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

interface PlayState {
	push: boolean;
	step: number | null;
}

function DepthCard({
	endpoint,
	index,
	live,
	onPick,
	refFor,
	shown,
}: {
	endpoint: DescentEndpoint;
	index: number;
	live: boolean;
	onPick: (step: number) => void;
	refFor: (el: HTMLButtonElement | null) => void;
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
			data-step={live ? "1" : "0"}
			onClick={() => {
				if (steps.length > 0) {
					onPick(steps[0] as number);
				}
			}}
			ref={refFor}
			title={`${node.label}  ·  ${node.filePath}`}
			type="button"
		>
			<span className="dc-card-l1">
				<span className="dc-card-cls">{node.className || "ƒ"}</span>
				<span className="dc-card-d">d{node.depth}</span>
			</span>
			<span className="dc-card-l2">
				<span className="dc-card-m">
					{node.member ? `${node.member}.${node.methodName}` : node.methodName}
				</span>
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
}: {
	endpoint: DescentEndpoint;
	kept: boolean[];
	live: number | null;
	onPick: (step: number) => void;
}) {
	const mapRef = useRef<HTMLDivElement>(null);
	const colsRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [wires, setWires] = useState<{
		height: number;
		padBottom: number;
		width: number;
		wires: Wire[];
	} | null>(null);

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

	// The lit card has to be on screen before the pile's ghost reads its rect,
	// and the jump has to be instant or the flight starts from the old spot.
	useEffect(() => {
		const map = mapRef.current;
		const card = cardRefs.current[liveNode];
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
	}, [liveNode]);

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
							return (
								<g key={wire.edge}>
									<path
										className="dc-wire"
										d={wire.path}
										data-eff={eff}
										data-live={isLive}
										strokeDasharray={wire.dash}
									/>
									{wire.twin && (
										<path
											className="dc-wire"
											d={wire.path}
											data-eff={eff}
											data-live={isLive}
											strokeDasharray={wire.dash}
											transform="translate(0,2.4)"
										/>
									)}
									<path
										className="dc-wire-head"
										d="M0 0 L-7 -3.4 L-7 3.4 Z"
										data-eff={eff}
										data-live={isLive}
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
	const flags = stepFlags(endpoint, walkStep);
	return (
		<>
			<span className="dc-block-l1">
				<span className="dc-block-cls">{node.label}</span>
				<span className="dc-block-at">d{walkStep.depth}</span>
				<span className="dc-block-at">@{step}</span>
			</span>
			<span className="dc-block-l2">
				<span className="dc-block-kind">
					{KIND_TAG[node.kind] ?? node.kind}
				</span>
				{effect && (
					<span className="dc-block-eff" data-eff={effect}>
						{EFF_TAG[node.effect]}
					</span>
				)}
				{node.dbOp && <span className="dc-glyph">db {node.dbOp}</span>}
				{flags.map((flag) => (
					<span className="dc-glyph" key={flag}>
						{flag}
					</span>
				))}
			</span>
		</>
	);
}

function ExecutionPile({
	endpoint,
	kept,
	onPick,
	play,
	speed,
}: {
	endpoint: DescentEndpoint;
	kept: boolean[];
	onPick: (step: number) => void;
	play: PlayState;
	speed: number;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const topRef = useRef<HTMLButtonElement>(null);
	const [viewH, setViewH] = useState(400);
	const [scrollTop, setScrollTop] = useState(0);

	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}
		const measure = () => setViewH(el.clientHeight || 400);
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	const items = useMemo(
		() => (play.step === null ? [] : pileItems(kept, play.step)),
		[kept, play.step]
	);
	const offsets = useMemo(() => {
		const out = [0];
		for (const item of items) {
			out.push((out.at(-1) as number) + (item.hidden ? DIV_H : PITCH));
		}
		return out;
	}, [items]);

	const total =
		(offsets.at(-1) as number) - (items.length > 0 ? PITCH - BLOCK_H : 0);
	const pad = Math.max(0, viewH - total);
	const mode = motionMode(speed);

	// The pile keeps every step, so only the rows near the scroll port render.
	// ponytail: linear scan over the offsets; a binary search if it ever drags.
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

	// The block that takes the weight is the next block, not the next row:
	// under a filter the row below the top is often a hidden-run divider.
	const underIndex = items.findIndex(
		(item, index) => index > 0 && item.step !== undefined
	);

	// The ghost flies from the lit card to the slot, unclipped by the scroller.
	useEffect(() => {
		const block = topRef.current;
		// A hidden tab never ticks a CSS animation, so animationend never fires
		// and the ghost would sit on the page for good.
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

	const dbSteps = endpoint.walk.filter(
		(step) => endpoint.nodes[step.node]?.dbOp
	).length;

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
						const effect = effectOf(endpoint, endpoint.walk[step] as never);
						return (
							<button
								className={classes}
								data-eff={effect === "plain" ? undefined : effect}
								data-top={isTop ? "1" : undefined}
								key={isTop || isUnder ? `${step}:${play.step}` : step}
								onClick={() => onPick(step)}
								ref={isTop ? topRef : undefined}
								style={{ top }}
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
								onClick={() => onPick(index)}
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
	const [presetIndex, setPresetIndex] = useState(0);
	const [filter, setFilter] = useState<FilterState>(() => presetState(0));
	const [showCats, setShowCats] = useState(false);
	const [play, setPlay] = useState<PlayState>({ push: false, step: null });
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);

	const endpoint = endpoints[selected];
	const kept = useMemo(() => {
		if (!endpoint) {
			return [] as boolean[];
		}
		const flags = new Array<boolean>(endpoint.walk.length).fill(false);
		for (const index of keptSteps(endpoint, filter)) {
			flags[index] = true;
		}
		return flags;
	}, [endpoint, filter]);
	const keptList = useMemo(
		() => kept.flatMap((on, index) => (on ? [index] : [])),
		[kept]
	);
	const counts = useMemo(
		() =>
			endpoint
				? categoryCounts(endpoint)
				: ({} as ReturnType<typeof categoryCounts>),
		[endpoint]
	);

	const goTo = (step: number | null, push: boolean) => setPlay({ push, step });

	// Reads the step off the previous state, so presses faster than a render
	// each move one step instead of all landing on the same one.
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

	// The walk has run out: the playhead stops itself rather than ticking on.
	useEffect(() => {
		if (playing && play.step !== null && play.step >= (keptList.at(-1) ?? -1)) {
			setPlaying(false);
		}
	}, [keptList, play.step, playing]);

	// The page's one timer: the playhead. No setTimeout, no animation frame.
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
	const viewClasses = ["dc-view", sideHidden ? "dc-side-hidden" : undefined]
		.filter(Boolean)
		.join(" ");
	const disabled = keptList.length === 0;

	return (
		<div className={viewClasses}>
			<div id="endpoints-sidebar">
				<RouteRail
					endpoints={endpoints}
					onHide={() => setSideHidden(true)}
					onSelect={(index) => {
						setSelected(index);
						setPlay({ push: false, step: null });
						setPlaying(false);
					}}
					selected={selected}
				/>
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
							{current && stepFlags(endpoint, current).length > 0
								? `  ·  ${stepFlags(endpoint, current).join(" · ")}`
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
						onPick={(step) => {
							setPlaying(false);
							goTo(step, false);
						}}
					/>
				</div>
			</div>
			<div id="endpoints-pile">
				<ExecutionPile
					endpoint={endpoint}
					kept={kept}
					onPick={(step) => {
						setPlaying(false);
						goTo(step, false);
					}}
					play={play}
					speed={speed}
				/>
			</div>
		</div>
	);
}
