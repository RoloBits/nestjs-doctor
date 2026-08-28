import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import type {
	ReportArtifact,
	SerializedModuleGraph,
} from "../../../../common/artifact.js";
import { heading } from "../../atoms/heading.js";
import { escapeHtml } from "../../browser/escape.js";
import {
	endpointsOf,
	providersOf,
	wiringChildren,
} from "../../browser/module-joins.js";
import { blastRadius } from "../../browser/module-layout.js";
import {
	formatMs,
	hookChipHtml,
	phaseParts,
	traceNode,
	traceRowHtml,
} from "../../browser/trace.js";
import { legend } from "../../molecules/legend.js";
import { Badge } from "../atoms/badge.js";
import { IconButton, TextButton } from "../atoms/button.js";
import { Heading } from "../atoms/heading.js";
import { Icon } from "../atoms/icon.js";
import {
	displayName,
	MG_EXTERNAL_PROJECT,
	type MgNode,
	ModulesCanvas,
} from "../lib/modules-canvas.js";
import { CheckboxRow } from "../molecules/checkbox-row.js";
import { EmptyState } from "../molecules/empty-state.js";
import { SearchField } from "../molecules/search-field.js";
import { SidebarHeader, TreeToolbar } from "../molecules/sidebar-header.js";
import { TreeRow } from "../molecules/tree-row.js";
import { ZoomBar } from "../molecules/zoom-bar.js";

const MG_DYNAMIC_TIPS: Record<string, string> = {
	forRoot: "Configures the module once for the whole app",
	forRootAsync: "forRoot with config resolved asynchronously at boot",
	forFeature: "Adds this module's own piece; forRoot did the app-wide setup",
	forFeatureAsync: "forFeature with config resolved asynchronously",
	register: "Configures the module for this consumer only",
	registerAsync: "register with config resolved asynchronously",
};

const MG_GROUP_KIND: Record<string, string> = {
	Services: "service",
	Repositories: "repo",
};

const SEV_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };
const PROVIDE_RE = /provide\s*:\s*([^,}]+)/;
const USE_RE =
	/(useExisting|useClass|useFactory|useValue)\s*:?\s*([A-Za-z0-9_$.]+)?/;
const SERVICE_RE = /Service$/;
const REPO_RE = /Repository$/;
const MODULE_RE = /Module$/;
const PROVIDER_NAME_RE = /Provider '([^']+)'/;

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

interface ModulesRegistry {
	jumpToSlowestBoot?: () => void;
	resize?: () => void;
	select?: (name: string) => void;
}

const registry: ModulesRegistry = {};

export function resizeModulesCanvas(): void {
	registry.resize?.();
}

export function jumpToSlowestBoot(): void {
	registry.jumpToSlowestBoot?.();
}

export function openModule(name: string): void {
	registry.select?.(name);
}

function kindOf(name: string, nodeMap: Record<string, MgNode>): string {
	if (nodeMap[name] || MODULE_RE.test(name)) {
		return "module";
	}
	if (SERVICE_RE.test(name)) {
		return "service";
	}
	if (REPO_RE.test(name)) {
		return "repo";
	}
	return "";
}

/** Token + strategy out of an object-literal provider kept as raw text. */
function parseObjectProvider(raw: string): {
	strategy: string | null;
	target: string | null;
	token: string;
} {
	const provide = raw.match(PROVIDE_RE);
	const use = raw.match(USE_RE);
	let token = provide ? (provide[1] as string).trim() : raw;
	const q = token.charAt(0);
	if ((q === '"' || q === "'") && token.at(-1) === q) {
		token = token.slice(1, -1);
	}
	return {
		token,
		strategy: use ? (use[1] as string) : null,
		target: use?.[2] ? use[2] : null,
	};
}

interface ProviderRow {
	name?: string;
	strategy?: string | null;
	target?: string | null;
	token?: string;
}

/** Class providers bucketed by suffix, object-literal providers folded into their token. */
function providerGroups(n: MgNode): {
	count: number;
	groups: Record<string, ProviderRow[]>;
} {
	const groups: Record<string, ProviderRow[]> = {
		Services: [],
		Repositories: [],
		Others: [],
	};
	const tokenRows: Record<string, ProviderRow> = {};
	for (const raw of n.providers) {
		if (raw.charAt(0) === "{") {
			const p = parseObjectProvider(raw);
			tokenRows[p.token] = p;
			continue;
		}
		let g = "Others";
		if (SERVICE_RE.test(raw)) {
			g = "Services";
		} else if (REPO_RE.test(raw)) {
			g = "Repositories";
		}
		(groups[g] as ProviderRow[]).push({ name: raw });
	}
	for (const token of n.providerTokens || []) {
		tokenRows[token] ??= { token, strategy: null, target: null };
	}
	const count =
		(groups.Services as ProviderRow[]).length +
		(groups.Repositories as ProviderRow[]).length +
		(groups.Others as ProviderRow[]).length;
	const tokenNames = Object.keys(tokenRows);
	for (const name of tokenNames) {
		(groups.Others as ProviderRow[]).push(tokenRows[name] as ProviderRow);
	}
	return { groups, count: count + tokenNames.length };
}

function Subhead({ group, count }: { count: number; group: string }) {
	const kind = MG_GROUP_KIND[group] || "";
	return (
		<div className={kind ? `md-subhead md-kind-${kind}` : "md-subhead"}>
			{group}
			<span className="md-subcount">{count}</span>
		</div>
	);
}

function NameSpan({ name, kind }: { kind: string; name: string }) {
	return (
		<span className={kind ? `md-row-name md-kind-${kind}` : "md-row-name"}>
			{name}
		</span>
	);
}

function Section({
	title,
	count,
	tip,
}: {
	count?: number;
	tip?: string;
	title: string;
}) {
	return (
		<Heading classes={tip ? "tip-wide" : undefined} level={4} tip={tip}>
			{title}
			{count === undefined ? "" : ` (${count})`}
			{tip && (
				<>
					{" "}
					<span className="md-info">
						<Icon name="info" />
					</span>
				</>
			)}
		</Heading>
	);
}

function UsedBySection({
	n,
	importers,
	nodeMap,
}: {
	importers: Record<string, string[]>;
	n: MgNode;
	nodeMap: Record<string, MgNode>;
}) {
	const sources = importers[n.name] || [];
	if (sources.length === 0) {
		return <div className="md-empty">Nothing imports this module.</div>;
	}
	const byProject: Record<string, { full: string; label: string }[]> = {};
	const order: string[] = [];
	for (const source of sources) {
		const src = nodeMap[source];
		const p = src?.project || "";
		if (!byProject[p]) {
			byProject[p] = [];
			order.push(p);
		}
		(byProject[p] as { full: string; label: string }[]).push({
			full: source,
			label: src ? displayName(src) : source,
		});
	}
	order.sort();
	return (
		<>
			{order.map((key) => {
				const rows = (byProject[key] as { full: string; label: string }[])
					.slice()
					.sort((a, b) => (a.label < b.label ? -1 : 1));
				return (
					<div key={key || "(root)"} style={{ display: "contents" }}>
						{key && (
							<div className="md-row" style={{ marginTop: 4 }}>
								<span className="md-badge md-project">{key}</span>
							</div>
						)}
						<ul>
							{rows.map((row) => (
								<li
									className="md-usedby-row"
									data-module={row.full}
									key={row.full}
								>
									{row.label}
								</li>
							))}
						</ul>
					</div>
				);
			})}
		</>
	);
}

function BlastGroup({
	label,
	names,
	tip,
	chainOf,
	nodeMap,
}: {
	chainOf: ((name: string) => string[]) | null;
	label: string;
	names: string[];
	nodeMap: Record<string, MgNode>;
	tip: string;
}) {
	const [showAll, setShowAll] = useState(false);
	if (names.length === 0) {
		return null;
	}
	const byProject: Record<string, { label: string; via: string }[]> = {};
	const order: string[] = [];
	for (const name of names) {
		const node = nodeMap[name];
		const p = node?.project || "this project";
		if (byProject[p] === undefined) {
			byProject[p] = [];
			order.push(p);
		}
		const via = chainOf ? chainOf(name) : [];
		(byProject[p] as { label: string; via: string }[]).push({
			label: node ? displayName(node) : name,
			via: via.length ? `via ${via.join(" → ")}` : "",
		});
	}
	order.sort(
		(a, b) =>
			(byProject[b] as unknown[]).length - (byProject[a] as unknown[]).length
	);
	return (
		<>
			<div className="md-subhead has-tip tip-wide" data-tip={tip}>
				{label}
				<span className="md-subcount">{names.length}</span>
			</div>
			<div className="md-group">
				{order.map((project, k) => {
					const mods = byProject[project] as { label: string; via: string }[];
					const tipLines: string[] = [];
					for (let t = 0; t < mods.length && t < 14; t++) {
						const mod = mods[t] as { label: string; via: string };
						tipLines.push(mod.label + (mod.via ? ` · ${mod.via}` : ""));
					}
					if (mods.length > 14) {
						tipLines.push(`+ ${mods.length - 14} more`);
					}
					const hidden = k >= 8 && !showAll;
					return (
						<details
							className={
								hidden
									? "md-blast-proj-details md-blast-hidden"
									: "md-blast-proj-details"
							}
							key={project}
						>
							<summary className="md-blast-row">
								<span className="md-ep-caret">▸</span>
								<span
									className="md-blast-pill has-tip tip-right tip-list"
									data-tip={tipLines.join("\n")}
								>
									{mods.length}
								</span>
								<span className="md-blast-proj">{project}</span>
							</summary>
							<ul className="md-blast-mods">
								{mods.map((mod) => (
									<li key={mod.label}>
										{mod.label}
										{mod.via && (
											<>
												{" "}
												<span className="md-blast-count">{mod.via}</span>
											</>
										)}
									</li>
								))}
							</ul>
						</details>
					);
				})}
				{order.length > 8 && !showAll && (
					// biome-ignore lint/a11y/noStaticElementInteractions: the row is the click target, as in the report's CSS
					// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the row is the click target, as in the report's CSS
					// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only panel
					<div
						className="md-more md-blast-more-toggle"
						onClick={() => setShowAll(true)}
					>
						+ {order.length - 8} more projects
					</div>
				)}
			</div>
		</>
	);
}

function BlastSection({
	n,
	importers,
	nodeMap,
	graph,
}: {
	graph: SerializedModuleGraph;
	importers: Record<string, string[]>;
	n: MgNode;
	nodeMap: Record<string, MgNode>;
}) {
	const blast = blastRadius(n.name, importers, (name) => {
		const node = nodeMap[name];
		return node ? node.project : "";
	});
	if (blast.names.length === 0) {
		return (
			<div className="md-empty">
				Nothing depends on this module, directly or otherwise.
			</div>
		);
	}
	const directSet = new Set(importers[n.name] || []);
	const direct: string[] = [];
	const indirect: string[] = [];
	for (const name of blast.names) {
		(directSet.has(name) ? direct : indirect).push(name);
	}

	// BFS parents over the reverse-import graph for chain reconstruction.
	const parent: Record<string, string> = {};
	const seen: Record<string, boolean> = { [n.name]: true };
	const queue = [n.name];
	while (queue.length) {
		const cur = queue.shift() as string;
		for (const imp of importers[cur] || []) {
			if (!seen[imp]) {
				seen[imp] = true;
				parent[imp] = cur;
				queue.push(imp);
			}
		}
	}
	const chainOf = (name: string): string[] => {
		const hops: string[] = [];
		let cur = parent[name];
		while (cur !== undefined && cur !== n.name) {
			hops.push(nodeMap[cur] ? displayName(nodeMap[cur] as MgNode) : cur);
			cur = parent[cur];
		}
		return hops.reverse();
	};

	return (
		<>
			<div className="md-blast-headline">
				Reaches <strong>{blast.names.length}</strong> module
				{blast.names.length === 1 ? "" : "s"}
				{graph.projects.length > 0 && (
					<>
						{" "}
						across <strong>{blast.projectCount}</strong> project
						{blast.projectCount === 1 ? "" : "s"}
					</>
				)}
			</div>
			<BlastGroup
				chainOf={null}
				label="Direct"
				names={direct}
				nodeMap={nodeMap}
				tip={`Modules that import ${displayName(n)} themselves.`}
			/>
			<BlastGroup
				chainOf={chainOf}
				label="Indirect"
				names={indirect}
				nodeMap={nodeMap}
				tip="Modules that reach it through a chain of imports."
			/>
		</>
	);
}

function ProvidersSection({
	n,
	report,
	unusedProviders,
}: {
	n: MgNode;
	report: ReportArtifact;
	unusedProviders: Record<string, boolean>;
}) {
	const owned = providersOf(report.providers, n.name);
	const byName: Record<string, (typeof owned)[number]> = {};
	for (const p of owned) {
		byName[p.name] = p;
	}
	const pv = providerGroups(n);
	if (pv.count === 0) {
		return <div className="md-empty">No providers.</div>;
	}
	const order = ["Services", "Repositories", "Others"];
	return (
		<>
			{order.map((group) => {
				const rows = pv.groups[group] as ProviderRow[];
				if (rows.length === 0) {
					return null;
				}
				return (
					<div key={group} style={{ display: "contents" }}>
						<Subhead count={rows.length} group={group} />
						<div className="md-group">
							{rows.map((row) => {
								if (row.token) {
									return (
										<div className="md-row" key={row.token}>
											<NameSpan kind="" name={row.token} />
											<Badge variant="md-token">token</Badge>
											{row.strategy && row.target && (
												<Badge variant="md-use">
													{row.strategy} → {row.target}
												</Badge>
											)}
										</div>
									);
								}
								const info = row.name ? byName[row.name] : undefined;
								return (
									<div className="md-row" key={row.name}>
										<NameSpan
											kind={MG_GROUP_KIND[group] || ""}
											name={row.name as string}
										/>
										{info?.scope && (
											<Badge variant="md-scope">{info.scope}</Badge>
										)}
										{row.name && unusedProviders[row.name] && (
											<Badge
												title="performance/no-unused-providers: never injected and not framework-activated"
												variant="md-unused"
											>
												unused?
											</Badge>
										)}
										{info?.publicMethodCount ? (
											<span className="md-blast-count">
												{info.publicMethodCount} methods
											</span>
										) : null}
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</>
	);
}

function WiringTree({
	deps,
	depth,
}: {
	deps: Parameters<typeof wiringChildren>[0];
	depth: number;
}) {
	const kids = wiringChildren(deps);
	if (kids.length === 0) {
		return null;
	}
	return (
		<ul className="md-tree">
			{kids.map((d, index) => {
				const sub = wiringChildren(d.dependencies);
				return (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable identity beyond their order
						key={`${d.className}:${index}`}
						style={{ paddingLeft: depth * 12 }}
					>
						<div className="md-tree-row">
							<span className="md-tree-elbow">└</span>
							<span className="md-tree-label">
								{d.className}
								{d.methodName && (
									<span style={{ color: "#777" }}>.{d.methodName}</span>
								)}
							</span>
							<span className={`md-dep-type md-t-${d.type}`}>{d.type}</span>
						</div>
						{sub.length > 0 &&
							(depth >= 2 ? (
								<details>
									<summary className="md-more">{sub.length} deeper</summary>
									<WiringTree deps={d.dependencies} depth={0} />
								</details>
							) : (
								<WiringTree deps={d.dependencies} depth={depth + 1} />
							))}
					</li>
				);
			})}
		</ul>
	);
}

function WiringSection({ n, report }: { n: MgNode; report: ReportArtifact }) {
	if (n.controllers.length === 0) {
		return <div className="md-empty">No controllers in this module.</div>;
	}
	let traced = 0;
	const blocks: ReactNode[] = [];
	for (const ctrl of n.controllers) {
		const eps = endpointsOf(report.endpoints, ctrl);
		if (eps.length === 0) {
			blocks.push(
				<div className="md-ctrl" key={ctrl}>
					<div className="md-ctrl-name">{ctrl}</div>
					<div className="md-empty">No traced endpoints.</div>
				</div>
			);
			continue;
		}
		traced += eps.length;
		blocks.push(
			<details className="md-ctrl md-ctrl-details" key={ctrl}>
				<summary className="md-ctrl-name">
					<span className="md-ep-caret">▸</span>
					{ctrl}
					<span className="md-subcount" style={{ marginLeft: 6 }}>
						{eps.length}
						{eps.length === 1 ? " route" : " routes"}
					</span>
				</summary>
				{eps.map((ep) => {
					const verb = (ep.httpMethod || "GET").toLowerCase();
					const verbClass = verb === "route" ? "md-verb-multi" : `md-${verb}`;
					const row = (
						<>
							<span className={`md-verb ${verbClass}`}>
								{(ep.httpMethod || "GET").toUpperCase()}
							</span>
							<span className="md-route">{ep.routePath || "/"}</span>
							<span style={{ color: "#666", fontSize: 10 }}>
								{" "}
								· {ep.handlerMethod}
							</span>
						</>
					);
					const tree = wiringChildren(ep.dependencies);
					const key = `${ctrl}.${ep.handlerMethod}`;
					if (tree.length === 0) {
						return (
							<div className="md-ep" key={key}>
								{row}
							</div>
						);
					}
					return (
						<details className="md-endpoint" key={key}>
							<summary className="md-ep">
								<span className="md-ep-caret">▸</span>
								{row}
							</summary>
							<WiringTree deps={ep.dependencies} depth={0} />
						</details>
					);
				})}
			</details>
		);
	}
	return (
		<>
			{blocks}
			{traced === 0 && (
				<div className="md-note">
					Endpoint tracing found no handlers for these controllers — a custom
					controller decorator can hide them from the scanner.
				</div>
			)}
		</>
	);
}

function ExportsSection({
	n,
	nodeMap,
}: {
	n: MgNode;
	nodeMap: Record<string, MgNode>;
}) {
	const groups: Record<string, { kind: string; name: string }[]> = {
		Services: [],
		Repositories: [],
		Others: [],
	};
	for (const name of n.exports) {
		const kind = kindOf(name, nodeMap);
		let g = "Others";
		if (kind === "service") {
			g = "Services";
		}
		if (kind === "repo") {
			g = "Repositories";
		}
		(groups[g] as { kind: string; name: string }[]).push({ name, kind });
	}
	const order = ["Services", "Repositories", "Others"];
	return (
		<>
			{order.map((group) => {
				const rows = groups[group] as { kind: string; name: string }[];
				if (rows.length === 0) {
					return null;
				}
				return (
					<div key={group} style={{ display: "contents" }}>
						<Subhead count={rows.length} group={group} />
						<div className="md-group">
							{rows.map((row) => (
								<div className="md-row" key={row.name}>
									<NameSpan kind={row.kind} name={row.name} />
									{row.kind === "module" && (
										<Badge variant="md-module">module</Badge>
									)}
								</div>
							))}
						</div>
					</div>
				);
			})}
		</>
	);
}

function CyclesSection({
	n,
	graph,
	onFocusCycle,
}: {
	graph: SerializedModuleGraph;
	n: MgNode;
	onFocusCycle: (names: string[]) => void;
}) {
	const cycles = graph.circularDeps.filter((cycle) => cycle.includes(n.name));
	if (cycles.length === 0) {
		return null;
	}
	return (
		<>
			<Heading level={4} style={{ color: "#ea2845" }}>
				Circular dependencies
			</Heading>
			{cycles.map((cycle) => {
				const rec = graph.circularDepRecommendations[cycle.join(",")];
				return (
					<div key={cycle.join("|")} style={{ display: "contents" }}>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: the row is the click target, as in the report's CSS */}
						{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the row is the click target, as in the report's CSS */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only panel */}
						<div
							className="md-cycle-row has-tip tip-wide"
							data-tip="Click to zoom the graph to this cycle"
							onClick={() => onFocusCycle(cycle)}
						>
							{`${cycle.join(" → ")} → ${cycle[0]}`}
						</div>
						{rec && (
							<div
								style={{
									margin: "6px 0 10px",
									padding: 8,
									background: "rgba(234,40,69,0.08)",
									border: "1px solid rgba(234,40,69,0.2)",
									borderRadius: 4,
									fontSize: 11,
									color: "#ccc",
									lineHeight: 1.5,
									whiteSpace: "pre-wrap",
								}}
							>
								{rec}
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}

const CONCEPTS_HTML = `
  <hr class="divider">
  <details class="concepts-details">
  <summary>NestJS Concepts</summary>
  <dl>
    <dt>Providers</dt>
    <dd>Injectable services (business logic, repositories, helpers) registered in the module's <code>providers</code> array. The core building block of NestJS DI.</dd>
    <dt>Controllers</dt>
    <dd>HTTP request handlers (routes) registered in the module's <code>controllers</code> array. They receive requests and delegate to providers.</dd>
    <dt>Imports</dt>
    <dd>Other modules this module depends on. Importing a module makes its exported providers available for injection.</dd>
    <dt>Exports</dt>
    <dd>Providers this module makes available to other modules that import it. Without exporting, providers stay private to the module.</dd>
    <dt style="color:#ea2845">Circular Dependency</dt>
    <dd>A cycle in module <strong style="color:#ccc">imports</strong>: Module A imports Module B, and Module B imports Module A (directly or through a chain like A &rarr; B &rarr; C &rarr; A). Because NestJS resolves modules in order, one side hasn't finished initializing — so its <strong style="color:#ccc">providers</strong> are <code>undefined</code> when the other tries to inject them.</dd>
    <dd style="margin-top:4px">This signals <strong style="color:#ccc">tangled responsibilities</strong> — two modules that can't work without each other should probably be one module, or the shared logic should be extracted into its own module.</dd>
    <dd style="margin-top:4px"><strong style="color:#ccc">Fix:</strong> Extract the shared providers into a new module both can import, breaking the cycle. This is the proper long-term solution.</dd>
    <dd style="margin-top:4px"><code>forwardRef()</code> tells NestJS to defer resolving a dependency until both modules are loaded. It works, but it's a <strong style="color:#ccc">band-aid</strong> — the cycle still exists, the code is harder to follow, and adding more modules to the chain makes it fragile. Use it only as a temporary fix while you refactor.</dd>
  </dl>
  </details>`;

function infoPopHtml(showCross: boolean, showGlobalReach: boolean): string {
	return (
		heading({ level: 3, text: "Legend", indent: 2 }) +
		legend([
			{
				kind: "color",
				style: "background:#1a1a2e;border-color:#333",
				label: "Module",
			},
			{
				kind: "color",
				style: "background:#1a2e1a;border-color:#2a5a2a",
				label: "Root module",
			},
			{
				kind: "color",
				style: "background:#2e1a1a;border-color:#ea2845",
				label: "Circular dependency",
			},
			{
				kind: "color",
				style: "background:#2a2410;border-color:#fbbf24",
				label: "Global module",
			},
			{ kind: "line", style: "background:#444", label: "Import" },
			{
				kind: "line",
				style: "background:#ea2845;border-top:1px dashed #ea2845;height:0",
				label: "Circular import",
			},
			{
				kind: "line",
				style: "background:transparent;border-top:2px dashed #22d3ee;height:0",
				label: "Cross-project import",
				id: "legend-cross",
				hidden: !showCross,
			},
			{
				kind: "line",
				style: "background:transparent;border-top:2px dotted #fbbf24;height:0",
				label: "Global reach (no import)",
				id: "legend-global-reach",
				hidden: !showGlobalReach,
			},
		]) +
		CONCEPTS_HTML
	);
}

// The trace body keeps the shipped renderer: rows come from traceRowHtml and
// expansion splices child rows in place, exactly like the script chunk did.
function TraceBody({
	graph,
	node,
	onLayoutChange,
}: {
	graph: SerializedModuleGraph;
	node: MgNode | null;
	onLayoutChange: () => void;
}) {
	const bodyRef = useRef<HTMLDivElement>(null);
	const topIdsRef = useRef<Record<string, boolean>>({});
	const traceMaxRef = useRef(1);
	const syncedNameRef = useRef<string | null>(null);
	const renderedKeyRef = useRef<string | undefined>(undefined);
	const trace = graph.timingsTrace || {};

	useEffect(() => {
		const body = bodyRef.current;
		if (!body) {
			return;
		}
		const mod =
			node &&
			!node.external &&
			graph.timingsAvailable &&
			node.initTimings?.length
				? node
				: null;
		const renderKey = mod ? mod.name : `note:${node ? node.name : ""}`;
		if (renderedKeyRef.current === renderKey) {
			return;
		}
		renderedKeyRef.current = renderKey;
		if (mod?.initTimings) {
			// Re-selecting the same module keeps its expanded cascade rows.
			if (syncedNameRef.current === mod.name) {
				return;
			}
			syncedNameRef.current = mod.name;
			const list = mod.initTimings;
			traceMaxRef.current =
				(list[0] as { initTime: number }).initTime > 0
					? (list[0] as { initTime: number }).initTime
					: 1;
			topIdsRef.current = {};
			let html = "";
			// The parser writes every timed class into the trace, so rows never miss it.
			for (const entry of list) {
				topIdsRef.current[entry.id] = true;
				html += traceRowHtml(trace, traceMaxRef.current, entry.id, 0, entry.id);
			}
			body.innerHTML = html;
		} else {
			syncedNameRef.current = null;
			const message = node
				? escapeHtml(
						`No timing data for ${displayName(node)} — it was not part of the captured boot, or its module name repeats across projects.`
					)
				: "Select a module to see its boot trace.";
			body.innerHTML = `<div class="mg-trace-note">${message}</div>`;
		}
		onLayoutChange();
	});

	useEffect(() => {
		const body = bodyRef.current;
		if (!body) {
			return;
		}
		const onClick = (ev: Event) => {
			const row = (ev.target as Element).closest<HTMLElement>(
				".mg-trace-expandable"
			);
			if (!row) {
				return;
			}
			const path = row.dataset.path as string;
			if (row.classList.contains("expanded")) {
				row.classList.remove("expanded");
				let next = row.nextElementSibling as HTMLElement | null;
				while (next?.dataset.path?.indexOf(`${path}/`) === 0) {
					const gone = next;
					next = next.nextElementSibling as HTMLElement | null;
					gone.remove();
				}
			} else {
				row.classList.add("expanded");
				const traced = traceNode(trace, row.dataset.trace as string);
				if (!traced) {
					return;
				}
				const depth = Number.parseInt(row.dataset.depth as string, 10) + 1;
				const parentMark = row.dataset.mark || null;
				let html = "";
				for (const depId of traced.deps) {
					// A dep with its own top-level row is detailed there, not paid again here.
					const mode =
						parentMark || (topIdsRef.current[depId] === true ? "listed" : null);
					html += traceRowHtml(
						trace,
						traceMaxRef.current,
						depId,
						depth,
						`${path}/${depId}`,
						mode
					);
				}
				row.insertAdjacentHTML("afterend", html);
			}
			onLayoutChange();
		};
		body.addEventListener("click", onClick);
		return () => body.removeEventListener("click", onClick);
	}, [trace, onLayoutChange]);

	return <div id="mg-trace-body" ref={bodyRef} />;
}

function PhasesStrip({ graph }: { graph: SerializedModuleGraph }) {
	const parts = phaseParts(graph);
	let total = 0;
	for (const part of parts) {
		total += part.ms;
	}
	if (parts.length === 0 || total <= 0) {
		return <div id="mg-trace-phases" />;
	}
	return (
		<div id="mg-trace-phases">
			<div className="mg-phase-strip">
				{parts.map((seg) => (
					<span
						className="mg-phase-seg"
						data-tip={seg.tip}
						key={seg.label}
						style={{
							width: `${((seg.ms / total) * 100).toFixed(2)}%`,
							background: `rgba(${seg.rgb},0.4)`,
						}}
					/>
				))}
			</div>
			<div className="mg-trace-note">
				{parts.map((seg, index) => (
					<span key={seg.label} style={{ display: "contents" }}>
						{index > 0 ? " · " : ""}
						<span style={{ color: `rgb(${seg.rgb})` }}>{seg.label}</span>{" "}
						{formatMs(seg.ms)}
					</span>
				))}
			</div>
		</div>
	);
}

export function ModulesTab({ report }: { report: ReportArtifact }) {
	const graph = report.graph;
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [zoomPct, setZoomPct] = useState(100);
	const [showGlobals, setShowGlobals] = useState(false);
	const [showExternal, setShowExternal] = useState(false);
	const [query, setQuery] = useState("");
	const [openProjects, setOpenProjects] = useState<ReadonlySet<string>>(
		new Set()
	);
	const [dockOpen, setDockOpen] = useState(false);
	const [dockActive, setDockActive] = useState("problems");
	const [infoOpen, setInfoOpen] = useState(false);
	const [controller, setController] = useState<ModulesCanvas | null>(null);
	const hideExternal = !showExternal;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const sidebarRef = useRef<HTMLDivElement>(null);
	const treeRef = useRef<HTMLDivElement>(null);
	const infoPopRef = useRef<HTMLDivElement>(null);
	const controllerRef = useRef<ModulesCanvas | null>(null);
	const resizerRef = useResizer(sidebarRef, controllerRef);

	const unusedProviders = useRef<Record<string, boolean> | null>(null);
	if (unusedProviders.current === null) {
		unusedProviders.current = {};
		for (const d of report.diagnostics) {
			if (d.rule === "performance/no-unused-providers") {
				const um = (d.message || "").match(PROVIDER_NAME_RE);
				if (um) {
					unusedProviders.current[um[1] as string] = true;
				}
			}
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: the controller mounts once for the page's lifetime
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const tooltipEl = tooltipRef.current;
		if (!(canvas && tooltipEl)) {
			return;
		}
		const instance = new ModulesCanvas({
			canvas,
			tooltipEl,
			report,
			callbacks: {
				onSelect: (name) => selectRef.current(name, false),
				onZoom: setZoomPct,
			},
		});
		controllerRef.current = instance;
		setController(instance);
		instance.init();
		registry.resize = () => instance.resize();
		registry.jumpToSlowestBoot = () => flushSync(() => jumpRef.current());
		registry.select = (name) => flushSync(() => selectRef.current(name, true));
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
			setController(null);
			registry.resize = undefined;
			registry.jumpToSlowestBoot = undefined;
			registry.select = undefined;
		};
	}, []);

	// A canvas or programmatic selection: sync tree, detail, and trace.
	const select = (name: string | null, fly: boolean) => {
		const controller = controllerRef.current;
		if (name === null) {
			controller?.clearSelection();
			setSelectedName(null);
			return;
		}
		const node = controller?.selectNode(name, fly);
		if (!node) {
			return;
		}
		// Selecting reopens a collapsed sidebar, like the chunk did.
		document
			.getElementById("tab-modules")
			?.classList.remove("mg-sidebar-collapsed");
		controller?.resize();
		if (node.project !== undefined) {
			setOpenProjects((prev) => {
				const key = node.project || "modules";
				if (prev.has(key)) {
					return prev;
				}
				const next = new Set(prev);
				next.add(key);
				return next;
			});
		}
		setSelectedName(name);
	};
	const selectRef = useRef(select);
	selectRef.current = select;

	const jump = () => {
		const trace = graph.timingsTrace || {};
		let maxId: string | null = null;
		let maxT = -1;
		for (const [id, entry] of Object.entries(trace)) {
			if (entry.initTime > maxT) {
				maxT = entry.initTime;
				maxId = id;
			}
		}
		let owner: string | null = null;
		let largest: string | null = null;
		let largestT = -1;
		for (const m of graph.modules) {
			if (!m.initTimings || m.initTimings.length === 0) {
				continue;
			}
			for (const timing of m.initTimings) {
				if (timing.id === maxId) {
					owner = m.name;
				}
			}
			if ((m.initTimings[0] as { initTime: number }).initTime > largestT) {
				largestT = (m.initTimings[0] as { initTime: number }).initTime;
				largest = m.name;
			}
		}
		const target = owner || largest;
		if (target) {
			selectRef.current(target, true);
		}
		setDockActive("trace");
		setDockOpen(true);
		controllerRef.current?.resize();
	};
	const jumpRef = useRef(jump);
	jumpRef.current = jump;

	// Scroll the selected tree row into view, like the chunk's mgSyncTree.
	useEffect(() => {
		if (!selectedName) {
			return;
		}
		for (const el of treeRef.current?.querySelectorAll<HTMLElement>(
			"[data-module]"
		) ?? []) {
			if (el.dataset.module === selectedName) {
				el.scrollIntoView({ block: "nearest" });
			}
		}
	}, [selectedName]);

	// The container class drives the external-modules CSS, like the chunk did.
	useEffect(() => {
		document
			.getElementById("tab-modules")
			?.classList.toggle("mg-ext-hidden", hideExternal);
	}, [hideExternal]);

	// Close the info popover on any outside click.
	useEffect(() => {
		if (!infoOpen) {
			return;
		}
		const onDocClick = (ev: Event) => {
			const pop = infoPopRef.current;
			if (pop && !pop.contains(ev.target as Node)) {
				setInfoOpen(false);
			}
		};
		document.addEventListener("click", onDocClick);
		return () => document.removeEventListener("click", onDocClick);
	}, [infoOpen]);

	const nodes = controller ? controller.nodes : [];
	const nodeMap = controller ? controller.nodeMap : {};
	const importers = controller ? controller.importers : {};
	const selected = selectedName ? (nodeMap[selectedName] ?? null) : null;

	const byProject: Record<string, MgNode[]> = {};
	for (const n of nodes) {
		const p = n.project || "modules";
		byProject[p] ??= [];
		(byProject[p] as MgNode[]).push(n);
	}
	const projectNames = Object.keys(byProject).sort((a, b) => {
		if (a === MG_EXTERNAL_PROJECT) {
			return 1;
		}
		if (b === MG_EXTERNAL_PROJECT) {
			return -1;
		}
		return a < b ? -1 : 1;
	});

	const q = query.trim().toLowerCase();
	const projectOpen = (name: string): boolean =>
		q !== "" || openProjects.has(name);

	const problems = report.diagnostics
		.filter((d) => Array.isArray(d.tags) && d.tags.includes("module-graph"))
		.map((diag) => {
			const fileToModule: Record<string, string> = {};
			for (const n of nodes) {
				fileToModule[n.filePath] = n.name;
			}
			for (const pr of report.providers) {
				if (pr.module && pr.filePath && !fileToModule[pr.filePath]) {
					fileToModule[pr.filePath] = pr.module;
				}
			}
			return { diag, module: fileToModule[diag.filePath] };
		})
		.filter((row) => row.module)
		.sort(
			(a, b) =>
				(SEV_ORDER[a.diag.severity] || 0) - (SEV_ORDER[b.diag.severity] || 0)
		);

	const onDetailHover = (ev: ReactMouseEvent) => {
		const row = (ev.target as Element).closest(
			".md-import-row, .md-usedby-row"
		) as HTMLElement | null;
		const isImport = Boolean(row?.classList.contains("md-import-row"));
		const nextImport = isImport && row ? (row.dataset.import as string) : null;
		const nextUsedBy = row && !isImport ? (row.dataset.module as string) : null;
		controllerRef.current?.setDetailHover(nextImport, nextUsedBy);
	};

	return (
		<>
			<div id="mg-sidebar" ref={sidebarRef}>
				<div className="schema-sidebar-sticky">
					<SidebarHeader
						count={projectNames.length}
						countId="mg-project-count"
						title="Projects"
						toolbar={
							<TreeToolbar
								noun="project"
								onCollapseAll={() => setOpenProjects(new Set())}
								onExpandAll={() => {
									track("module_tree_expanded");
									setOpenProjects(new Set(projectNames));
								}}
								onHide={() => {
									track("graph_sidebar_toggled");
									document
										.getElementById("tab-modules")
										?.classList.add("mg-sidebar-collapsed");
									controllerRef.current?.resize();
								}}
								prefix="mg"
								subject="graph"
							/>
						}
					/>
					<SearchField
						id="mg-search"
						onChange={(value) => {
							setQuery(value);
							controllerRef.current?.applySearch(value);
						}}
						placeholder="Search projects and modules"
						value={query}
					/>
					<div className="mg-toggle-row">
						<CheckboxRow
							checked={showGlobals}
							id="mg-globals"
							label="Show @Global() reach"
							onChange={(checked) => {
								setShowGlobals(checked);
								controllerRef.current?.setShowGlobals(checked);
							}}
						/>
						<CheckboxRow
							checked={showExternal}
							id="mg-show-external"
							label="Show external modules"
							onChange={(checked) => {
								setShowExternal(checked);
								controllerRef.current?.setHideExternal(!checked);
							}}
						/>
					</div>
				</div>
				<div id="mg-tree" ref={treeRef}>
					{projectNames.map((pname) => {
						if (hideExternal && pname === MG_EXTERNAL_PROJECT) {
							return null;
						}
						const mods = (byProject[pname] as MgNode[])
							.slice()
							.sort((a, b) => (displayName(a) < displayName(b) ? -1 : 1));
						const pMatch = q !== "" && pname.toLowerCase().includes(q);
						const visibleMods = mods.filter(
							(n) => q === "" || pMatch || n.name.toLowerCase().includes(q)
						);
						if (q !== "" && !pMatch && visibleMods.length === 0) {
							return null;
						}
						const open = projectOpen(pname);
						return (
							<div key={pname} style={{ display: "contents" }}>
								<TreeRow
									classes="mg-tree-project"
									depth={0}
									extra={<span className="st-count">{mods.length}</span>}
									icon={<Icon name="box" />}
									label={<span className="st-entity-name">{pname}</span>}
									onClick={() =>
										setOpenProjects((prev) => {
											const next = new Set(prev);
											if (next.has(pname)) {
												next.delete(pname);
											} else {
												next.add(pname);
											}
											return next;
										})
									}
									onToggle={() =>
										setOpenProjects((prev) => {
											const next = new Set(prev);
											if (next.has(pname)) {
												next.delete(pname);
											} else {
												next.add(pname);
											}
											return next;
										})
									}
									toggleGlyph={open ? "▾" : "▸"}
								/>
								<div className={open ? "st-children st-open" : "st-children"}>
									{visibleMods.map((n) => (
										<div data-module={n.name} key={n.name}>
											<TreeRow
												classes={
													selectedName === n.name
														? "mg-tree-module st-selected"
														: "mg-tree-module"
												}
												depth={1}
												extra={
													controller?.circularModules.has(n.name) ? (
														<span
															className="st-count"
															style={{ color: "var(--nest-red)" }}
														>
															cycle
														</span>
													) : undefined
												}
												label={displayName(n)}
												onClick={() => {
													track("module_opened_from_tree");
													selectRef.current(n.name, true);
												}}
											/>
										</div>
									))}
								</div>
							</div>
						);
					})}
				</div>
				<div id="detail" style={{ display: selected ? "block" : "none" }}>
					<TextButton
						classes="close-btn"
						id="close-detail"
						onClick={() => selectRef.current(null, false)}
					>
						×
					</TextButton>
					<Heading id="detail-name" level={2}>
						{selected ? displayName(selected) : ""}
					</Heading>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: the trace badge is the click target, as in the report's CSS */}
					{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the trace badge is the click target, as in the report's CSS */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only panel */}
					<div
						id="detail-badges"
						onClick={(ev) => {
							if ((ev.target as Element).closest("#detail-timings-btn")) {
								setDockActive("trace");
								setDockOpen(true);
								controllerRef.current?.resize();
							}
						}}
					>
						{selected?.project && (
							<Badge variant="md-project">{selected.project}</Badge>
						)}
						{selected?.isGlobal && <Badge variant="md-global">global</Badge>}
						{selected && controller?.circularModules.has(selected.name) && (
							<Badge variant="md-cycle">in cycle</Badge>
						)}
						{selected && controller?.rootModules.has(selected.name) && (
							<Badge variant="md-root">root</Badge>
						)}
						{selected &&
							graph.timingsAvailable &&
							selected.initTimings &&
							selected.initTimings.length > 0 && (
								<Badge
									id="detail-timings-btn"
									tip="Open the Boot trace"
									variant="md-use"
								>
									{formatMs(
										(selected.initTimings[0] as { initTime: number }).initTime
									)}{" "}
									· trace ▸
								</Badge>
							)}
						{selected && graph.timingsAvailable && (
							<span
								// biome-ignore lint/security/noDangerouslySetInnerHtml: hook chips come from the tested trace module
								dangerouslySetInnerHTML={{
									__html: hookChipHtml(selected.hookTimings),
								}}
								style={{ display: "contents" }}
							/>
						)}
					</div>
					<div className="filepath" id="detail-path">
						{selected
							? selected.filePath + (selected.line ? `:${selected.line}` : "")
							: ""}
					</div>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: rows inside are hover and click targets, as in the report's CSS */}
					{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: rows inside are hover and click targets, as in the report's CSS */}
					{/* biome-ignore lint/a11y/useKeyWithMouseEvents: matches the shipped report's mouse-only hover highlight */}
					<div
						id="detail-sections"
						onMouseLeave={() =>
							controllerRef.current?.setDetailHover(null, null)
						}
						onMouseOver={onDetailHover}
					>
						{selected && (
							<>
								{selected.isGlobal && (
									<div className="md-note">
										Marked @Global() — its exports resolve in every module
										without an import.
									</div>
								)}
								<Section
									count={(importers[selected.name] || []).length}
									tip="Modules that import this one directly, grouped by project."
									title="Used by"
								/>
								<UsedBySection
									importers={importers}
									n={selected}
									nodeMap={nodeMap}
								/>
								<Section
									tip="What a change here can break: every module that imports this one, directly or transitively."
									title="Blast radius"
								/>
								<BlastSection
									graph={graph}
									importers={importers}
									n={selected}
									nodeMap={nodeMap}
								/>
								<Section
									count={providerGroups(selected).count}
									tip="What this module registers in its providers array, grouped by kind."
									title="Providers"
								/>
								<ProvidersSection
									n={selected}
									report={report}
									unusedProviders={unusedProviders.current}
								/>
								{selected.imports.length > 0 && (
									<>
										<Section
											count={selected.imports.length}
											tip="Modules this one depends on; their exports become injectable here."
											title="Imports"
										/>
										<ul>
											{selected.imports.map((imp) => {
												const target = nodeMap[imp];
												const label = target ? displayName(target) : imp;
												const method = selected.dynamicImports?.[imp];
												const methodTip = method
													? MG_DYNAMIC_TIPS[method] ||
														`Dynamic import: ${method}() returns a configured module`
													: "";
												const external = !target || target.external === true;
												return (
													<li
														className={
															external
																? "md-import-row md-import-ext"
																: "md-import-row"
														}
														data-import={imp}
														key={imp}
													>
														<span className="md-kind-module">{label}</span>
														{method && (
															<Badge
																classes="has-tip tip-wide badge-tip"
																style={{ marginLeft: 5 }}
																tip={methodTip}
																variant="md-scope"
															>
																{method}
															</Badge>
														)}
														{external && (
															<Badge
																classes="has-tip tip-wide badge-tip"
																style={{ marginLeft: 5 }}
																tip="Not declared in this codebase — it comes from a package, e.g. @nestjs/config"
																variant="md-ext"
															>
																external
															</Badge>
														)}
														{target?.project &&
															target.project !== selected.project && (
																<Badge
																	style={{ marginLeft: 5 }}
																	variant="md-project"
																>
																	{target.project}
																</Badge>
															)}
													</li>
												);
											})}
										</ul>
									</>
								)}
								{selected.exports.length > 0 && (
									<>
										<Section
											count={selected.exports.length}
											tip="What this module makes available to the modules that import it."
											title="Exports"
										/>
										<ExportsSection n={selected} nodeMap={nodeMap} />
									</>
								)}
								<Section
									count={selected.controllers.length}
									tip="This module's controllers, their endpoints, and the providers each handler calls."
									title="Wiring"
								/>
								<WiringSection n={selected} report={report} />
								<CyclesSection
									graph={graph}
									n={selected}
									onFocusCycle={(names) =>
										controllerRef.current?.focusCycle(names)
									}
								/>
							</>
						)}
					</div>
				</div>
			</div>
			<div id="mg-resizer" ref={resizerRef} />
			<div id="mg-main">
				<div id="mg-wrap">
					<IconButton
						ariaLabel="Show the project list"
						icon="sidebarShow"
						id="mg-sidebar-show"
						onClick={() => {
							document
								.getElementById("tab-modules")
								?.classList.remove("mg-sidebar-collapsed");
							controllerRef.current?.resize();
						}}
						tip="Show list · bring the project list back"
					/>
					<div id="mg-toolbar">
						<ZoomBar
							onFit={() => controllerRef.current?.recenter()}
							onRange={(pct) => controllerRef.current?.setZoomPct(pct)}
							onZoomIn={() => {
								track("graph_zoomed");
								controllerRef.current?.zoomIn();
							}}
							onZoomOut={() => {
								track("graph_zoomed");
								controllerRef.current?.zoomOut();
							}}
							pct={zoomPct}
							prefix="mg"
							subject="graph"
						/>
						<IconButton
							ariaLabel="Re-center graph"
							icon="recenter"
							id="mg-recenter"
							modifier="schema-diagram-btn"
							onClick={() => {
								track("graph_recentered");
								controllerRef.current?.recenter();
							}}
							tip="Re-center · bring the graph back into view"
						/>
						<IconButton
							ariaLabel="Legend and concepts"
							icon="info"
							id="mg-info"
							modifier="schema-diagram-btn"
							onClick={() => setInfoOpen((prev) => !prev)}
							tip="Info · legend and NestJS concepts"
						/>
					</div>
					<canvas id="graph" ref={canvasRef} />
					<div
						className="schema-tooltip"
						id="mg-tooltip"
						ref={tooltipRef}
						style={{ display: "none" }}
					/>
					<EmptyState
						classes={graph.modules.length === 0 ? "visible" : undefined}
						icon={{
							name: "toggleView",
							size: 48,
							stroke: "var(--text-dim)",
							strokeWidth: "1.5",
						}}
						id="mg-empty-state"
						text="No modules were found in this project"
					/>
				</div>
				<div
					className={dockOpen ? "open" : undefined}
					data-active={dockActive}
					id="mg-dock"
				>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: the whole header is the click target, as in the report's CSS */}
					{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole header is the click target, as in the report's CSS */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only dock */}
					<div
						id="mg-dock-header"
						onClick={(ev) => {
							const tabEl = (ev.target as Element).closest(
								".mg-dock-tab"
							) as HTMLElement | null;
							if (
								tabEl &&
								!(dockOpen && dockActive === tabEl.dataset.dockTab)
							) {
								setDockActive(tabEl.dataset.dockTab as string);
								setDockOpen(true);
								controllerRef.current?.resize();
								return;
							}
							setDockOpen((prev) => !prev);
							controllerRef.current?.resize();
						}}
					>
						<span
							className="mg-dock-tab"
							data-dock-tab="problems"
							id="mg-dock-tab-problems"
						>
							Module problems{" "}
							<span className="schema-entity-count" id="mg-problems-count">
								{problems.length}
							</span>
						</span>
						<span
							className="mg-dock-tab"
							data-dock-tab="trace"
							id="mg-dock-tab-trace"
							style={graph.timingsAvailable ? undefined : { display: "none" }}
						>
							Boot trace{" "}
							<span className="schema-entity-count" id="mg-trace-ms">
								{selected?.initTimings?.length && graph.timingsAvailable
									? `${displayName(selected)} · ${formatMs((selected.initTimings[0] as { initTime: number }).initTime)}`
									: ""}
							</span>
						</span>
						<span
							aria-label="How to read the trace"
							className="mg-trace-info"
							data-tip={
								"How to read the trace\n• bars scale to the slowest row\n• yellow segment ≈ the class's own work\n• dimmed hollow bar = reused, built earlier\n• rows are the create phase\n• +ms chips = lifecycle hooks"
							}
							role="img"
							// biome-ignore lint/a11y/noNoninteractiveTabindex: focusable on purpose so the tooltip opens from the keyboard
							tabIndex={0}
						>
							<Icon ariaHidden={true} name="infoDot" size={13} />
						</span>
						<span style={{ flex: 1 }} />
						<span className="mg-problems-chevron" id="mg-dock-chevron">
							{dockOpen ? "▾" : "▴"}
						</span>
					</div>
					<div id="mg-problems-list">
						{problems.length === 0 ? (
							<div className="md-empty" style={{ padding: "8px 14px" }}>
								No problems.
							</div>
						) : (
							problems.map((row, index) => (
								// biome-ignore lint/a11y/noStaticElementInteractions: the row is the click target, as in the report's CSS
								// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the row is the click target, as in the report's CSS
								// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only dock
								<div
									className="mg-problem-row mg-problem-linked"
									data-module={row.module}
									// biome-ignore lint/suspicious/noArrayIndexKey: findings have no stable identity beyond their order
									key={`${row.diag.rule}:${index}`}
									onClick={() => {
										track("module_opened_from_finding");
										selectRef.current(row.module as string, true);
									}}
								>
									<span
										className={`mg-problem-sev mg-sev-${row.diag.severity}`}
									/>
									<span className="mg-problem-msg">{row.diag.message}</span>
									<span className="mg-problem-rule">{row.diag.rule || ""}</span>
									<span className="mg-problem-module">{row.module}</span>
								</div>
							))
						)}
					</div>
					<PhasesStrip graph={graph} />
					<TraceBody
						graph={graph}
						node={selected}
						onLayoutChange={() => controllerRef.current?.resize()}
					/>
				</div>
				<div
					className={infoOpen ? "visible" : undefined}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static legend markup from the report's own string molecules
					dangerouslySetInnerHTML={{
						__html: infoPopHtml(graph.projects.length > 0, showGlobals),
					}}
					id="mg-info-pop"
					ref={infoPopRef}
				/>
			</div>
		</>
	);
}

// The resizer drags the sidebar width directly, without re-rendering.
function useResizer(
	sidebarRef: { current: HTMLDivElement | null },
	controllerRef: { current: ModulesCanvas | null }
) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const handle = ref.current;
		if (!handle) {
			return;
		}
		const onDown = (ev: MouseEvent) => {
			ev.preventDefault();
			const sidebarEl = sidebarRef.current;
			if (!sidebarEl) {
				return;
			}
			const startX = ev.clientX;
			const startW = sidebarEl.getBoundingClientRect().width;
			document.body.classList.add("mg-resizing");
			const onMove = (mv: MouseEvent) => {
				const w = Math.max(240, Math.min(640, startW + (mv.clientX - startX)));
				sidebarEl.style.width = `${w}px`;
				sidebarEl.style.minWidth = `${w}px`;
				controllerRef.current?.resize();
			};
			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.classList.remove("mg-resizing");
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		};
		handle.addEventListener("mousedown", onDown);
		return () => handle.removeEventListener("mousedown", onDown);
	}, [sidebarRef, controllerRef]);
	return ref;
}
