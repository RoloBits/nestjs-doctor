import { useEffect, useRef, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import type { EndpointNode } from "../../../../common/endpoint.js";
import { IconButton, TextButton } from "../atoms/button.js";
import { Icon } from "../atoms/icon.js";
import { EndpointCanvas, type EpNode } from "../lib/endpoint-canvas.js";
import { CodeViewer } from "../molecules/code-viewer.js";
import { EmptyState } from "../molecules/empty-state.js";
import { SidebarHeader } from "../molecules/sidebar-header.js";
import { TreeRow } from "../molecules/tree-row.js";

const METHOD_COLORS: Record<string, string> = {
	GET: "ep-method-get",
	POST: "ep-method-post",
	PUT: "ep-method-put",
	PATCH: "ep-method-patch",
	DELETE: "ep-method-delete",
};

let activeCanvas: EndpointCanvas | null = null;

export function resizeEndpointsCanvas(): void {
	activeCanvas?.resize();
}

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

function groupByController(
	endpoints: EndpointNode[]
): { controller: string; endpoints: EndpointNode[] }[] {
	const groups: { controller: string; endpoints: EndpointNode[] }[] = [];
	const byName = new Map<
		string,
		{ controller: string; endpoints: EndpointNode[] }
	>();
	for (const ep of endpoints) {
		let group = byName.get(ep.controllerClass);
		if (!group) {
			group = { controller: ep.controllerClass, endpoints: [] };
			byName.set(ep.controllerClass, group);
			groups.push(group);
		}
		group.endpoints.push(ep);
	}
	return groups;
}

function CodePanel({
	node,
	sources,
	onClose,
}: {
	node: EpNode | null;
	onClose: () => void;
	sources: Record<string, string>;
}) {
	const panelRef = useRef<HTMLDivElement>(null);
	const handleRef = useRef<HTMLDivElement>(null);

	// The resize handle drags the panel width directly, without re-rendering.
	useEffect(() => {
		const handle = handleRef.current;
		const panel = panelRef.current;
		if (!(handle && panel)) {
			return;
		}
		let resizing = false;
		let startX = 0;
		let startW = 0;
		const onDown = (e: MouseEvent) => {
			resizing = true;
			startX = e.clientX;
			startW = panel.offsetWidth;
			handle.classList.add("dragging");
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			e.preventDefault();
		};
		const onMove = (e: MouseEvent) => {
			if (!resizing) {
				return;
			}
			let w = startW + (e.clientX - startX);
			if (w < 300) {
				w = 300;
			}
			if (w > window.innerWidth * 0.8) {
				w = window.innerWidth * 0.8;
			}
			panel.style.width = `${w}px`;
		};
		const onUp = () => {
			if (!resizing) {
				return;
			}
			resizing = false;
			handle.classList.remove("dragging");
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
		handle.addEventListener("mousedown", onDown);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			handle.removeEventListener("mousedown", onDown);
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	useEffect(() => {
		if (!node) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [node, onClose]);

	const code = node?.filePath ? sources[node.filePath] : undefined;
	const panelClasses = ["ep-code-panel", node ? "open" : undefined]
		.filter(Boolean)
		.join(" ");
	return (
		<div className={panelClasses} id="ep-code-panel" ref={panelRef}>
			<div className="ep-code-panel-header">
				<div className="ep-code-panel-title">
					<span className="ep-code-panel-class" id="ep-code-panel-class">
						{node?.className}
					</span>
					<span className="ep-code-panel-method" id="ep-code-panel-method">
						{node?.methodName ? `.${node.methodName}()` : ""}
					</span>
				</div>
				<div className="ep-code-panel-path" id="ep-code-panel-path">
					{node?.filePath || ""}
				</div>
				<TextButton
					classes="ep-code-panel-close"
					id="ep-code-panel-close"
					onClick={onClose}
				>
					×
				</TextButton>
			</div>
			<div className="ep-code-panel-body" id="ep-code-panel-body">
				{node &&
					(code ? (
						<CodeViewer
							code={code}
							options={{
								highlightLines:
									node.line !== undefined && node.line > 0 ? [node.line] : [],
								firstLineNumber: 1,
							}}
						/>
					) : (
						<div className="ep-code-no-source">Source code not available</div>
					))}
			</div>
			<div
				className="ep-code-panel-resize"
				id="ep-code-panel-resize"
				ref={handleRef}
			/>
		</div>
	);
}

export function EndpointsTab({ report }: { report: ReportArtifact }) {
	const endpoints = report.endpoints.endpoints;
	const groups = groupByController(endpoints);
	const [selected, setSelected] = useState<EndpointNode | null>(null);
	const [closedControllers, setClosedControllers] = useState<
		ReadonlySet<string>
	>(new Set());
	const [panelNode, setPanelNode] = useState<EpNode | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const controllerRef = useRef<EndpointCanvas | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const tooltipEl = tooltipRef.current;
		if (!(canvas && tooltipEl)) {
			return;
		}
		const instance = new EndpointCanvas({
			canvas,
			tooltipEl,
			onNodeClick: (node) => {
				track("endpoint_code_opened");
				setPanelNode(node);
			},
		});
		controllerRef.current = instance;
		activeCanvas = instance;
		instance.resize();
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
			activeCanvas = null;
		};
	}, []);

	useEffect(() => {
		if (selected) {
			controllerRef.current?.setGraph(selected);
		}
	}, [selected]);

	return (
		<>
			<CodePanel
				node={panelNode}
				onClose={() => setPanelNode(null)}
				sources={report.sources}
			/>
			<div id="endpoints-sidebar">
				<div className="endpoints-sidebar-sticky">
					<SidebarHeader
						classes="endpoints-sidebar-header"
						count={endpoints.length}
						countId="endpoints-count"
						title="Endpoints"
					/>
				</div>
				<div id="endpoints-list">
					{groups.map((group) => {
						const open = !closedControllers.has(group.controller);
						return (
							<div key={group.controller} style={{ display: "contents" }}>
								<TreeRow
									depth={0}
									extra={
										<span className="st-count">{group.endpoints.length}</span>
									}
									icon={<Icon name="controller" />}
									label={
										<span className="st-entity-name">{group.controller}</span>
									}
									onToggle={() =>
										setClosedControllers((prev) => {
											const next = new Set(prev);
											if (next.has(group.controller)) {
												next.delete(group.controller);
											} else {
												next.add(group.controller);
											}
											return next;
										})
									}
									toggleGlyph={open ? "▾" : "▸"}
								/>
								<div className={open ? "st-children st-open" : "st-children"}>
									{group.endpoints.map((ep) => {
										const method = (ep.httpMethod || "GET").toUpperCase();
										const isSelected =
											selected?.controllerClass === ep.controllerClass &&
											selected?.handlerMethod === ep.handlerMethod;
										return (
											<TreeRow
												before={
													<span
														className={`ep-method-badge ${METHOD_COLORS[method] || "ep-method-get"}`}
													>
														{method}
													</span>
												}
												classes={
													isSelected
														? "ep-endpoint-row st-selected"
														: "ep-endpoint-row"
												}
												depth={1}
												key={`${ep.controllerClass}.${ep.handlerMethod}`}
												label={ep.routePath || "/"}
												onClick={() => setSelected(ep)}
											/>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</div>
			<div id="endpoints-main">
				<div id="endpoints-canvas-wrap">
					<EmptyState
						icon={{ name: "activity", size: 48 }}
						id="endpoints-empty-state"
						style={{ display: selected ? "none" : "flex" }}
						text="Select an endpoint from the sidebar to view its dependency graph"
					/>
					<div id="endpoints-toolbar">
						<IconButton
							icon="recenter"
							id="endpoints-recenter"
							modifier="schema-diagram-btn"
							onClick={() => controllerRef.current?.recenter()}
							title="Re-center diagram"
						/>
					</div>
					<canvas
						id="endpoints-canvas"
						ref={canvasRef}
						style={{ display: selected ? "block" : "none" }}
					/>
					<div
						className="schema-tooltip"
						id="endpoints-tooltip"
						ref={tooltipRef}
						style={{ display: "none" }}
					/>
				</div>
			</div>
		</>
	);
}
