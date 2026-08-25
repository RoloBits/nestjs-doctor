import { useEffect, useRef, useState } from "react";
import {
	MG_EXTERNAL_PROJECT,
	type MgNode,
	ModuleGraphPainter,
	PROJECT_COLORS,
	reverseIndex,
} from "../canvas/module-graph-painter";
import type { ReportModel } from "../model";

function projectColor(key: string, projects: string[]): string {
	if (key === MG_EXTERNAL_PROJECT) {
		return "#6b7280";
	}
	const i = projects.indexOf(key);
	return i >= 0 ? PROJECT_COLORS[i % PROJECT_COLORS.length] : "#555";
}

export function ModulesTab({ model }: { model: ReportModel }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const painterRef = useRef<ModuleGraphPainter | null>(null);
	const [selected, setSelected] = useState<MgNode | null>(null);
	const [zoomPct, setZoomPct] = useState(100);
	const [showGlobals, setShowGlobals] = useState(false);
	const [hideExternal, setHideExternal] = useState(true);
	const [search, setSearch] = useState("");
	const [activeProject, setActiveProject] = useState("all");

	const projects = model.graph.projects;

	useEffect(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!(canvas && wrap)) {
			return;
		}

		const painter = new ModuleGraphPainter(canvas, {
			onSelect: setSelected,
			onZoomChange: setZoomPct,
		});
		painterRef.current = painter;
		painter.setModel(model);
		painter.resize(wrap.clientWidth, wrap.clientHeight);

		if (typeof ResizeObserver === "undefined") {
			return;
		}
		const ro = new ResizeObserver(() => {
			painter.resize(wrap.clientWidth, wrap.clientHeight);
			painter.centerCamera();
		});
		ro.observe(wrap);

		let panning = false;
		let moved = false;
		let lastX = 0;
		let lastY = 0;

		const onPointerDown = (e: PointerEvent): void => {
			panning = true;
			moved = false;
			lastX = e.clientX;
			lastY = e.clientY;
			canvas.setPointerCapture(e.pointerId);
		};
		const onPointerMove = (e: PointerEvent): void => {
			if (panning) {
				const dx = e.clientX - lastX;
				const dy = e.clientY - lastY;
				if (Math.abs(dx) + Math.abs(dy) > 3) {
					moved = true;
				}
				painter.camX += dx / painter.zoom;
				painter.camY += dy / painter.zoom;
				lastX = e.clientX;
				lastY = e.clientY;
				painter.scheduleRedraw();
				return;
			}
			const rect = canvas.getBoundingClientRect();
			const world = painter.screenToWorld(
				e.clientX - rect.left,
				e.clientY - rect.top
			);
			const hit = painter.hitTest(world.x, world.y);
			canvas.style.cursor = hit ? "pointer" : "grab";
			const tip = tooltipRef.current;
			if (!tip) {
				return;
			}
			if (hit && !moved) {
				tip.innerHTML =
					`<div class="tt-name">${ModuleGraphPainter.displayName(hit)}</div>` +
					`<div class="tt-table">${hit.providers.length}&nbsp;providers \u00b7 ${hit.controllers.length}&nbsp;controllers \u00b7 ${hit.imports.length}&nbsp;imports</div>`;
				tip.style.display = "block";
				tip.style.left = `${Math.min(e.clientX - rect.left + 14, painter.w - 240)}px`;
				tip.style.top = `${e.clientY - rect.top + 14}px`;
			} else {
				tip.style.display = "none";
			}
		};
		const onPointerUp = (e: PointerEvent): void => {
			panning = false;
			if (moved) {
				return;
			}
			const rect = canvas.getBoundingClientRect();
			const world = painter.screenToWorld(
				e.clientX - rect.left,
				e.clientY - rect.top
			);
			const hit = painter.hitTest(world.x, world.y);
			painter.select(hit);
		};
		const onWheel = (e: WheelEvent): void => {
			e.preventDefault();
			painter.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
		};
		const onLeave = (): void => {
			if (tooltipRef.current) {
				tooltipRef.current.style.display = "none";
			}
		};

		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("pointerleave", onLeave);
		canvas.addEventListener("wheel", onWheel, { passive: false });

		return () => {
			ro.disconnect();
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", onPointerUp);
			canvas.removeEventListener("pointerleave", onLeave);
			canvas.removeEventListener("wheel", onWheel);
			painterRef.current = null;
		};
	}, [model]);

	const applySearch = (raw: string): void => {
		setSearch(raw);
		painterRef.current?.applySearch(raw);
	};

	const toggleFlag = (
		value: boolean,
		set: (v: boolean) => void,
		apply: (p: ModuleGraphPainter, v: boolean) => void
	): void => {
		set(value);
		const p = painterRef.current;
		if (!p) {
			return;
		}
		apply(p, value);
		p.centerCamera();
		p.scheduleRedraw();
	};

	const setProjectFilter = (project: string): void => {
		setActiveProject(project);
		const p = painterRef.current;
		if (!p) {
			return;
		}
		p.activeProject = project;
		p.scheduleRedraw();
	};

	const focusNode = (name: string): void => {
		painterRef.current?.focus(name);
		setSelected(painterRef.current?.selected ?? null);
	};

	const importersOf = selected
		? (reverseIndex(model.graph.edges)[selected.name] ?? [])
		: [];

	return (
		<div className="modules-layout">
			<div id="mg-sidebar">
				<div className="schema-sidebar-header">
					<span className="schema-sidebar-title">Modules</span>
					<span className="schema-entity-count">
						{model.graph.modules.length}
					</span>
				</div>
				<div className="mg-side-search">
					<input
						autoComplete="off"
						onChange={(e) => applySearch(e.target.value)}
						placeholder="Search modules"
						spellCheck={false}
						type="search"
						value={search}
					/>
				</div>
				<label className="schema-sync">
					<input
						checked={hideExternal}
						onChange={(e) =>
							toggleFlag(e.target.checked, setHideExternal, (p, v) => {
								p.hideExternal = v;
							})
						}
						type="checkbox"
					/>
					<span>Hide external</span>
				</label>
				<label className="schema-sync">
					<input
						checked={showGlobals}
						onChange={(e) =>
							toggleFlag(e.target.checked, setShowGlobals, (p, v) => {
								p.showGlobals = v;
							})
						}
						type="checkbox"
					/>
					<span>Show @Global() reach</span>
				</label>
				{projects.length > 0 && (
					<div className="mg-project-filter">
						<button
							className={
								activeProject === "all" ? "sev-pill active" : "sev-pill"
							}
							onClick={() => setProjectFilter("all")}
							type="button"
						>
							All projects
						</button>
						{projects.map((project) => (
							<button
								className={
									activeProject === project ? "sev-pill active" : "sev-pill"
								}
								key={project}
								onClick={() => setProjectFilter(project)}
								type="button"
							>
								<span
									className="ov-cat-icon"
									style={{
										background: projectColor(project, projects),
										display: "inline-block",
										marginRight: 6,
									}}
								/>
								{project}
							</button>
						))}
					</div>
				)}
				<div id="mg-tree">
					{model.graph.modules.map((m) => {
						const isSel = selected?.name === m.name;
						return (
							<button
								className={isSel ? "tree-file active" : "tree-file"}
								key={m.name}
								onClick={() => focusNode(m.name)}
								type="button"
							>
								<div className="tree-file-header">
									<span className="tree-file-name">{m.name}</span>
									<span className="tree-count">{m.providers.length}p</span>
								</div>
							</button>
						);
					})}
				</div>
			</div>

			<div id="mg-wrap" ref={wrapRef}>
				<canvas id="graph" ref={canvasRef} />
				<div className="mg-zoombar">
					<button
						onClick={() => painterRef.current?.zoomBy(1.25)}
						type="button"
					>
						+
					</button>
					<span>{zoomPct}%</span>
					<button
						onClick={() => painterRef.current?.zoomBy(1 / 1.25)}
						type="button"
					>
						−
					</button>
					<button
						onClick={() => painterRef.current?.centerCamera()}
						title="Fit to view"
						type="button"
					>
						Fit
					</button>
				</div>
				<div className="mg-tooltip" ref={tooltipRef} />
				{selected && (
					<div id="mg-detail-pop">
						<button
							className="mg-detail-close"
							onClick={() => painterRef.current?.select(null)}
							type="button"
						>
							×
						</button>
						<div className="tt-name">{selected.label}</div>
						{selected.project && selected.project !== MG_EXTERNAL_PROJECT && (
							<span className="meta-badge">{selected.project}</span>
						)}
						{selected.filePath && (
							<div className="file-view-dir">{selected.filePath}</div>
						)}
						<div className="mg-detail-section">
							<div className="section-label">
								Used by ({importersOf.length})
							</div>
							{importersOf.map((name) => (
								<button
									className="mg-link-row"
									key={name}
									onClick={() => focusNode(name)}
									type="button"
								>
									{name}
								</button>
							))}
							{importersOf.length === 0 && (
								<span className="placeholder">nothing imports it</span>
							)}
						</div>
						<div className="mg-detail-section">
							<div className="section-label">
								Imports ({selected.imports.length})
							</div>
							{selected.imports.slice(0, 12).map((name) => (
								<button
									className="mg-link-row"
									key={name}
									onClick={() => focusNode(name)}
									type="button"
								>
									{name}
								</button>
							))}
						</div>
						<div className="mg-detail-section">
							<div className="section-label">
								Providers ({selected.providers.length})
							</div>
							{selected.providers.map((name) => (
								<div className="mg-link-row static" key={name}>
									{name}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
