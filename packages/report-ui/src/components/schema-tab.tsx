import { useEffect, useMemo, useRef, useState } from "react";
import { SchemaPainter } from "../canvas/schema-painter";
import type { ReportModel } from "../model";

export function SchemaTab({ model }: { model: ReportModel }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const painterRef = useRef<SchemaPainter | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	const entities = useMemo(
		() =>
			[...model.schema.entities].sort((a, b) => a.name.localeCompare(b.name)),
		[model.schema.entities]
	);
	const diagnosticsFor = selected
		? model.diagnostics.filter((d) => "entity" in d && d.entity === selected)
		: [];

	useEffect(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!(canvas && wrap)) {
			return;
		}

		const painter = new SchemaPainter(canvas);
		painter.setModel(model);
		painterRef.current = painter;
		if (typeof ResizeObserver === "undefined") {
			return;
		}
		painter.resize(wrap.clientWidth, wrap.clientHeight);
		painter.centerCamera();

		const ro = new ResizeObserver(() => {
			painter.resize(wrap.clientWidth, wrap.clientHeight);
			painter.centerCamera();
		});
		ro.observe(wrap);

		let panning = false;
		let lastX = 0;
		let lastY = 0;
		let downX = 0;
		let downY = 0;
		const onPointerDown = (e: PointerEvent): void => {
			panning = true;
			downX = e.clientX;
			downY = e.clientY;
			lastX = e.clientX;
			lastY = e.clientY;
			canvas.setPointerCapture(e.pointerId);
		};
		const onPointerMove = (e: PointerEvent): void => {
			if (!panning) {
				return;
			}
			painter.camX += e.clientX - lastX;
			painter.camY += e.clientY - lastY;
			lastX = e.clientX;
			lastY = e.clientY;
			painter.scheduleRedraw();
		};
		const onPointerUp = (e: PointerEvent): void => {
			if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < 4) {
				const rect = canvas.getBoundingClientRect();
				const hit = painter.hitTest(
					(e.clientX - rect.left - painter.camX) / painter.zoom,
					(e.clientY - rect.top - painter.camY) / painter.zoom
				);
				const name = hit?.entity.name ?? null;
				painter.select(name);
				setSelected(name);
			}
			panning = false;
		};
		const onWheel = (e: WheelEvent): void => {
			e.preventDefault();
			painter.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
		};

		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", onPointerUp);
		canvas.addEventListener("wheel", onWheel, { passive: false });

		return () => {
			ro.disconnect();
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", onPointerUp);
			canvas.removeEventListener("wheel", onWheel);
			painterRef.current = null;
		};
	}, [model]);

	const pickEntity = (name: string): void => {
		setSelected(name);
		painterRef.current?.focusEntity(name);
	};

	return (
		<div className="modules-layout">
			<div id="endpoints-sidebar">
				<div className="schema-sidebar-header">
					<span className="schema-sidebar-title">Entities</span>
					<span className="schema-entity-count">{entities.length}</span>
				</div>
				<div className="mg-side-search">
					<input
						autoComplete="off"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search entities"
						spellCheck={false}
						type="search"
						value={search}
					/>
				</div>
				<div id="mg-tree">
					{entities
						.filter((e) =>
							e.name.toLowerCase().includes(search.trim().toLowerCase())
						)
						.map((e) => (
							<button
								className={
									selected === e.name
										? "st-row mg-tree-module st-selected"
										: "st-row mg-tree-module"
								}
								key={e.name}
								onClick={() => pickEntity(e.name)}
								type="button"
							>
								<span className="st-label">{e.name}</span>
								<span className="st-count">{e.columns.length}c</span>
							</button>
						))}
				</div>
			</div>

			<div id="mg-wrap" ref={wrapRef}>
				<canvas id="schema-canvas" ref={canvasRef} />
				<div className="mg-zoombar">
					<button
						onClick={() => painterRef.current?.zoomBy(1.25)}
						type="button"
					>
						+
					</button>
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
				{selected && (
					<div id="ep-code-panel">
						<button
							className="mg-detail-close"
							onClick={() => {
								setSelected(null);
								painterRef.current?.select(null);
							}}
							type="button"
						>
							×
						</button>
						<div className="file-view-title">{selected}</div>
						{diagnosticsFor.map((d) => (
							<div className="diag-info-item" key={d.rule + d.message}>
								<div className="diag-info-header">
									<span className={`code-sev-badge ${d.severity}`}>
										{d.severity}
									</span>
									<span className="code-rule-badge">{d.rule}</span>
								</div>
								<div className="diag-info-msg">{d.message}</div>
								{d.help && (
									<div className="diag-info-help">
										<div className="section-label">Recommendation</div>
										{d.help}
									</div>
								)}
							</div>
						))}
						{diagnosticsFor.length === 0 && (
							<span className="placeholder">no schema findings for it</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
