import { useEffect, useMemo, useRef, useState } from "react";
import {
	EndpointsPainter,
	type EpNode,
	groupEndpoints,
	handlerSource,
} from "../canvas/endpoints-painter";
import type { EndpointNodePayload, ReportModel } from "../model";

const VERB_CLASS: Record<string, string> = {
	GET: "md-get",
	POST: "md-post",
	PUT: "md-put",
	PATCH: "md-patch",
	DELETE: "md-delete",
};

export function EndpointsTab({ model }: { model: ReportModel }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const painterRef = useRef<EndpointsPainter | null>(null);
	const [selected, setSelected] = useState<EndpointNodePayload | null>(null);
	const [hovered, setHovered] = useState<EpNode | null>(null);

	const groups = useMemo(
		() => groupEndpoints(model.endpoints.endpoints),
		[model.endpoints.endpoints]
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!(canvas && wrap)) {
			return;
		}

		const painter = new EndpointsPainter(canvas);
		painterRef.current = painter;
		if (typeof ResizeObserver === "undefined") {
			return;
		}
		painter.resize(wrap.clientWidth, wrap.clientHeight);

		const ro = new ResizeObserver(() => {
			painter.resize(wrap.clientWidth, wrap.clientHeight);
			painter.centerCamera();
		});
		ro.observe(wrap);

		let panning = false;

		let lastX = 0;
		let lastY = 0;
		const onPointerDown = (e: PointerEvent): void => {
			panning = true;

			lastX = e.clientX;
			lastY = e.clientY;
			canvas.setPointerCapture(e.pointerId);
		};
		const onPointerMove = (e: PointerEvent): void => {
			if (panning) {
				const dx = e.clientX - lastX;
				const dy = e.clientY - lastY;
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
			setHovered(hit);
			canvas.style.cursor = hit ? "pointer" : "grab";
		};
		const onPointerUp = (): void => {
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
	}, []);

	useEffect(() => {
		painterRef.current?.select(selected);
	}, [selected]);

	const pickEndpoint = (ep: EndpointNodePayload): void => {
		setSelected(ep);
		window.__ndTrack?.("endpoint_code_opened");
	};

	return (
		<div className="modules-layout">
			<div id="endpoints-sidebar">
				<div className="schema-sidebar-header">
					<span className="schema-sidebar-title">Controllers</span>
					<span className="schema-entity-count">{groups.length}</span>
				</div>
				<div id="endpoints-list">
					{groups.map((group) => (
						<div key={group.controller}>
							<div className="st-row mg-tree-project">
								<span className="st-label">{group.controller}</span>
								<span className="st-count">{group.endpoints.length}</span>
							</div>
							<div className="st-children st-open">
								{group.endpoints.map((ep) => {
									const active =
										selected === ep ||
										(selected?.controllerClass === ep.controllerClass &&
											selected.routePath === ep.routePath &&
											selected.handlerMethod === ep.handlerMethod);
									return (
										<button
											className={active ? "st-row st-selected" : "st-row"}
											key={`${ep.httpMethod} ${ep.routePath} ${ep.handlerMethod}`}
											onClick={() => pickEndpoint(ep)}
											type="button"
										>
											<span
												className={`ep-verb ${VERB_CLASS[ep.httpMethod.toUpperCase()] ?? ""}`}
											>
												{ep.httpMethod.toUpperCase()}
											</span>
											<span className="st-label">{ep.routePath}</span>
										</button>
									);
								})}
							</div>
						</div>
					))}
					{groups.length === 0 && (
						<div className="md-empty">No traced endpoints.</div>
					)}
				</div>
			</div>

			<div id="mg-wrap" ref={wrapRef}>
				<canvas id="endpoints-canvas" ref={canvasRef} />
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
				{hovered && selected && (
					<div className="mg-tooltip endpoints-hint">
						{hovered.className}.{hovered.methodName}
					</div>
				)}
				{selected && (
					<div id="ep-code-panel">
						<button
							className="mg-detail-close"
							onClick={() => setSelected(null)}
							type="button"
						>
							×
						</button>
						<div className="file-view-title">
							<span
								className={`ep-verb ${VERB_CLASS[selected.httpMethod.toUpperCase()] ?? ""}`}
							>
								{selected.httpMethod.toUpperCase()}
							</span>{" "}
							{selected.routePath}
						</div>
						<div className="file-view-dir">
							{selected.controllerClass}.{selected.handlerMethod}
							{selected.truncated ? " · trace truncated" : ""}
						</div>
						<pre className="example-code">
							{handlerSource(model, selected) ?? "// source not available"}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
}
