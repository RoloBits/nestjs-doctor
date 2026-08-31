import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
	ReportArtifact,
	SerializedModuleGraph,
} from "../../../../common/artifact.js";
import { hoverCardData } from "../lib/boot-hover.js";
import { hoverAnchor, placeHoverCard, timeAt } from "../lib/boot-pointer.js";
import {
	type BootSpan,
	type BootTraceView,
	type BootWindow,
	buildBootTimeline,
	expandableIds,
	rowsHtml,
	slowestSpanId,
	traceViews,
	u,
	windowAround,
} from "../lib/boot-timeline.js";
import { cssAttr } from "../lib/escape.js";
import { formatMs } from "../lib/trace.js";
import { useLatest } from "../lib/use-latest.js";
import { BootCrosshair } from "../molecules/boot-crosshair.js";
import { BootEmpty } from "../molecules/boot-empty.js";
import { BootResizer } from "../molecules/boot-resizer.js";
import { BootRows } from "../molecules/boot-rows.js";
import { HoverCard, type HoverCardData } from "../molecules/hover-card.js";
import { BootLanes } from "../organisms/boot-lanes.js";
import { BootSideHead } from "../organisms/boot-side-head.js";

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

interface BootViewProps {
	compact?: boolean;
	focusModule?: string | null;
	graph: SerializedModuleGraph;
	/** Fires with the span whenever a class row is selected. */
	onSelectSpan?: (span: BootSpan) => void;
	/** Pins the view to one trace and hides the picker. */
	traceIndex?: number;
}

function toggled(set: ReadonlySet<string>, key: string): Set<string> {
	const next = new Set(set);
	if (!next.delete(key)) {
		next.add(key);
	}
	return next;
}

// A class's own row, in an open group, matching the filter.
function visibleRows(wrap: HTMLElement): HTMLElement[] {
	return Array.from(
		wrap.querySelectorAll<HTMLElement>(
			".boot-group:not(.boot-collapsed) > .boot-class-row:not(.boot-cascade-row):not(.boot-filtered)"
		)
	);
}

const registry: { focus?: (className?: string) => void } = {};

/** Selects and frames a class on the boot timeline; default is the slowest. */
export function focusBootTrace(className?: string): void {
	registry.focus?.(className);
}

export function BootTab({ report }: { report: ReportArtifact }) {
	return (
		<div className="boot-tab">
			<BootView graph={report.graph} />
		</div>
	);
}

// The boot trace: the label column and the tracks share the rows, the lanes
// above them share the axis. State lives here; the pieces are dumb.
export function BootView({
	compact,
	focusModule,
	graph,
	onSelectSpan,
	traceIndex,
}: BootViewProps) {
	const views = useMemo<BootTraceView[]>(() => traceViews(graph), [graph]);
	const [ownIdx, setOwnIdx] = useState(0);
	const activeIdx = Math.min(traceIndex ?? ownIdx, views.length - 1);
	const view = views[activeIdx];
	const timeline = useMemo(
		() => (view ? buildBootTimeline(view.graph) : null),
		[view]
	);
	const [win, setWin] = useState<BootWindow>({
		from: 0,
		to: timeline?.maxMs ?? 1,
	});
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [sideHidden, setSideHidden] = useState(false);
	const [hover, setHover] = useState<HoverCardData | null>(null);
	const [expandedModules, setExpandedModules] = useState<ReadonlySet<string>>(
		() => new Set(timeline?.groups.map((g) => g.module) ?? [])
	);
	const [expandedCascades, setExpandedCascades] = useState<ReadonlySet<string>>(
		new Set()
	);
	const viewRef = useRef<HTMLDivElement>(null);
	const mainRef = useRef<HTMLDivElement>(null);
	const axisRef = useRef<HTMLDivElement>(null);
	const rowsRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const cursorChipRef = useRef<HTMLSpanElement>(null);
	const hoverCardRef = useRef<HTMLDivElement>(null);
	const hoverTetherRef = useRef<HTMLDivElement>(null);
	const hoverKeyRef = useRef<string | null>(null);
	const lastHoverRef = useRef<{
		bar: HTMLElement;
		x: number;
		y: number;
	} | null>(null);
	const pendingScrollRef = useRef<string | null>(null);
	const pendingFocusRef = useRef<string | null>(null);

	const timelineRef = useLatest(timeline);
	const selectedIdRef = useLatest(selectedId);
	const onSelectSpanRef = useLatest(onSelectSpan);
	const winRef = useLatest(win);

	// The focus entry point: deep links land here after switchTab("boot").
	const focusSpan = (className?: string) => {
		const t = timelineRef.current;
		if (!t) {
			return;
		}
		const named = className
			? [...t.byId.values()].find((s) => s.name === className)
			: undefined;
		if (className && !named && traceIndex === undefined) {
			const other = views.findIndex(
				(v, i) =>
					i !== activeIdx &&
					Object.values(v.graph.timingsTrace ?? {}).some(
						(n) => n.name === className
					)
			);
			if (other !== -1) {
				pendingFocusRef.current = className;
				setOwnIdx(other);
				return;
			}
		}
		const hit = named ?? t.byId.get(slowestSpanId(t) ?? "");
		if (!hit) {
			return;
		}
		setExpandedModules((prev) => new Set(prev).add(hit.module));
		setSelectedId(hit.id);
		const a = u(t.scale, hit.start);
		const b = u(t.scale, hit.end, true);
		setWin(
			windowAround({ end: Math.max(a, b), start: Math.min(a, b) }, t.maxMs)
		);
		pendingScrollRef.current = hit.id;
	};
	const focusRef = useLatest(focusSpan);

	// biome-ignore lint/correctness/useExhaustiveDependencies: focusRef is a stable useLatest ref; the handler must read the latest focus
	useEffect(() => {
		if (compact) {
			return;
		}
		registry.focus = (className) =>
			flushSync(() => focusRef.current(className));
		return () => {
			registry.focus = undefined;
		};
	}, [compact]);

	// A view switch gets a fresh window, selection, and open groups.
	// biome-ignore lint/correctness/useExhaustiveDependencies: focusRef is a stable useLatest ref
	useEffect(() => {
		setWin({ from: 0, to: timeline?.maxMs ?? 1 });
		setSelectedId(null);
		setExpandedModules(new Set(timeline?.groups.map((g) => g.module) ?? []));
		const pending = pendingFocusRef.current;
		if (pending) {
			pendingFocusRef.current = null;
			focusRef.current(pending);
		}
	}, [timeline]);

	// The dock's compact view follows the module selected in the graph.
	useEffect(() => {
		if (!(compact && focusModule && timeline)) {
			return;
		}
		setExpandedModules((prev) => new Set(prev).add(focusModule));
		const el = rowsRef.current?.querySelector(
			`.boot-group[data-group="${cssAttr(focusModule)}"] .boot-group-row`
		);
		el?.scrollIntoView?.({ block: "nearest" });
	}, [compact, focusModule, timeline]);

	// Repaint the string-rendered rows whenever the view state moves.
	useLayoutEffect(() => {
		const t = timeline;
		const rows = rowsRef.current;
		if (!(t && rows)) {
			return;
		}
		rows.innerHTML = rowsHtml(t, {
			expandedCascades,
			expandedModules,
			query,
			selectedId,
			selectedModule: compact ? focusModule : null,
			win,
		});
		const pending = pendingScrollRef.current;
		if (pending) {
			pendingScrollRef.current = null;
			// The class's own row, never one of its deduped shadows.
			const el =
				rows.querySelector(
					`.boot-group > .boot-class-row:not(.boot-cascade-row)[data-id="${cssAttr(pending)}"]`
				) ?? rows.querySelector(`[data-id="${cssAttr(pending)}"]`);
			el?.scrollIntoView?.({ block: "nearest" });
			el?.classList.add("boot-flash");
		}
	}, [
		compact,
		expandedCascades,
		expandedModules,
		focusModule,
		query,
		selectedId,
		timeline,
		win,
	]);

	// Clicks: group headers collapse, carets cascade, rows select.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the handler reads the latest selection and timeline through stable useLatest refs
	useEffect(() => {
		const rows = rowsRef.current;
		if (!rows) {
			return;
		}
		const onClick = (ev: MouseEvent) => {
			const target = ev.target as Element;
			if (target.closest(".boot-group-row")) {
				const name = target.closest<HTMLElement>(".boot-group")?.dataset.group;
				if (!name) {
					return;
				}
				setExpandedModules((prev) => toggled(prev, name));
				return;
			}
			const row = target.closest<HTMLElement>(".boot-row");
			const id = row?.dataset.id;
			if (!(row && id)) {
				return;
			}
			if (target.closest(".boot-caret")) {
				setExpandedCascades((prev) => toggled(prev, id));
				return;
			}
			// A second click on the selected row clears the selection. Selecting
			// from a deduped row opens the class's own module and scrolls to it.
			const selecting = selectedIdRef.current !== id;
			setSelectedId(selecting ? id : null);
			const span = timelineRef.current?.byId.get(id);
			if (selecting && span && row.classList.contains("boot-cascade-row")) {
				setExpandedModules((prev) =>
					prev.has(span.module) ? prev : new Set(prev).add(span.module)
				);
				pendingScrollRef.current = id;
			}
			if (selecting && span) {
				onSelectSpanRef.current?.(span);
			}
			if (!compact) {
				track("boot_span_selected");
			}
		};
		rows.addEventListener("click", onClick);
		return () => rows.removeEventListener("click", onClick);
	}, [compact]);

	// The hover card rides the pointer over a bar or a hook span; its content
	// only changes when the pointer moves onto a different one.
	useEffect(() => {
		const rows = rowsRef.current;
		if (!(rows && timeline)) {
			return;
		}
		const clear = () => {
			if (hoverKeyRef.current !== null) {
				hoverKeyRef.current = null;
				setHover(null);
			}
		};
		const onMove = (ev: MouseEvent) => {
			const el = (ev.target as Element).closest<HTMLElement>(
				".boot-bar, .boot-hook-span"
			);
			const row = el?.closest<HTMLElement>(".boot-row");
			const id = row?.dataset.id;
			const span = id ? timeline.byId.get(id) : undefined;
			if (!(el && row && id && span)) {
				clear();
				return;
			}
			const hookIndex =
				el.dataset.hook === undefined ? null : Number(el.dataset.hook);
			const key = `${span.id}:${hookIndex ?? "bar"}`;
			const anchor = hoverAnchor(
				rows,
				scrollRef.current,
				el,
				row,
				id,
				hookIndex,
				ev.clientY
			);
			lastHoverRef.current = { bar: anchor.bar, x: ev.clientX, y: anchor.y };
			if (hoverKeyRef.current !== key) {
				hoverKeyRef.current = key;
				setHover(hoverCardData(timeline, span, hookIndex));
			}
			placeHoverCard(
				hoverCardRef.current,
				hoverTetherRef.current,
				anchor.bar,
				ev.clientX,
				anchor.y
			);
		};
		rows.addEventListener("mousemove", onMove);
		rows.addEventListener("mouseleave", clear);
		return () => {
			rows.removeEventListener("mousemove", onMove);
			rows.removeEventListener("mouseleave", clear);
		};
	}, [timeline]);

	// Places the card again once its new content has rendered.
	useLayoutEffect(() => {
		const last = lastHoverRef.current;
		if (hover && last) {
			placeHoverCard(
				hoverCardRef.current,
				hoverTetherRef.current,
				last.bar,
				last.x,
				last.y
			);
		}
	}, [hover]);

	// Keyboard: arrows walk rows, F fits, Escape clears.
	useEffect(() => {
		const wrap = scrollRef.current;
		if (!(wrap && timeline)) {
			return;
		}
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.target instanceof HTMLInputElement) {
				return;
			}
			if (ev.key === "Escape") {
				setSelectedId(null);
				return;
			}
			if (ev.key === "f" || ev.key === "0") {
				setWin({ from: 0, to: timeline.maxMs });
				return;
			}
			if (!(ev.key === "ArrowDown" || ev.key === "ArrowUp")) {
				return;
			}
			ev.preventDefault();
			const visible = visibleRows(wrap);
			if (visible.length === 0) {
				return;
			}
			const idx = visible.findIndex((el) =>
				el.classList.contains("boot-selected")
			);
			const step = ev.key === "ArrowDown" ? 1 : -1;
			let nextIdx: number;
			if (idx === -1) {
				nextIdx = step === 1 ? 0 : visible.length - 1;
			} else {
				nextIdx = Math.max(0, Math.min(visible.length - 1, idx + step));
			}
			const next = visible[nextIdx];
			const nextId = next?.dataset.id;
			if (nextId) {
				setSelectedId(nextId);
				next.scrollIntoView?.({ block: "nearest" });
			}
		};
		wrap.addEventListener("keydown", onKeyDown);
		return () => wrap.removeEventListener("keydown", onKeyDown);
	}, [timeline]);

	// Crosshair: a vertical line under the mouse with its time on a chip
	// riding the axis, like an APM trace waterfall.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reads the latest window and axis through stable refs
	useEffect(() => {
		const main = mainRef.current;
		const axis = axisRef.current;
		const line = cursorRef.current;
		const chip = cursorChipRef.current;
		if (!(main && axis && line && chip)) {
			return;
		}
		const hide = () => {
			line.style.display = "none";
		};
		const onMove = (ev: MouseEvent) => {
			const rect = main.getBoundingClientRect();
			const axisRect = axis.getBoundingClientRect();
			if (ev.clientX < axisRect.left || ev.clientX > axisRect.right) {
				hide();
				return;
			}
			const x = ev.clientX - rect.left;
			line.style.display = "block";
			line.style.left = `${x}px`;
			chip.textContent = formatMs(
				timeAt(ev.clientX, axis, winRef.current, timelineRef.current?.scale)
			);
			chip.style.top = `${axisRect.top - rect.top}px`;
			// The chip rides the line; clamp it so it never leaves the lanes.
			const half = chip.offsetWidth / 2 + 2;
			const clamped = Math.max(
				axisRect.left - rect.left + half,
				Math.min(x, axisRect.right - rect.left - half)
			);
			chip.style.left = `${clamped - x}px`;
		};
		main.addEventListener("mousemove", onMove);
		main.addEventListener("mouseleave", hide);
		return () => {
			main.removeEventListener("mousemove", onMove);
			main.removeEventListener("mouseleave", hide);
		};
	}, []);

	if (!timeline) {
		return <BootEmpty />;
	}

	// Enter in the filter steps through the rows that match it.
	const stepMatch = () => {
		const wrap = scrollRef.current;
		if (!wrap) {
			return;
		}
		const matches = visibleRows(wrap);
		if (matches.length === 0) {
			return;
		}
		const current = selectedIdRef.current;
		const idx = current
			? matches.findIndex((el) => el.dataset.id === current)
			: -1;
		const id = matches[(idx + 1) % matches.length]?.dataset.id;
		if (id && id !== current) {
			setSelectedId(id);
			pendingScrollRef.current = id;
		}
	};

	const viewClasses = [
		"boot-view",
		compact ? "boot-compact" : undefined,
		sideHidden ? "boot-side-hidden" : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={viewClasses} ref={viewRef}>
			{!compact && <BootResizer viewRef={viewRef} />}
			<div className="boot-main" ref={mainRef}>
				{!compact && traceIndex === undefined && views.length > 1 && (
					<div className="boot-trace-picker">
						{views.map((v, i) => {
							const cls = i === activeIdx ? "active" : undefined;
							return (
								<button
									className={cls}
									key={`${v.project ?? ""}:${v.label}`}
									onClick={() => setOwnIdx(i)}
									type="button"
								>
									{v.label}
								</button>
							);
						})}
					</div>
				)}
				<div className="boot-head">
					<BootSideHead
						classCount={timeline.byId.size}
						compact={compact}
						hidden={!compact && sideHidden}
						onCollapseAll={() => {
							setExpandedModules(new Set());
							setExpandedCascades(new Set());
						}}
						onExpandAll={() => {
							setExpandedModules(new Set(timeline.groups.map((g) => g.module)));
							setExpandedCascades(expandableIds(timeline));
						}}
						onHide={() => setSideHidden(true)}
						onQueryChange={setQuery}
						onQueryEnter={stepMatch}
						onShow={() => setSideHidden(false)}
						query={query}
					/>
					<BootLanes
						axisRef={axisRef}
						onWindowChange={setWin}
						timeline={timeline}
						win={win}
					/>
				</div>
				<div className="boot-body">
					<BootRows rowsRef={rowsRef} scrollRef={scrollRef} />
				</div>
				<BootCrosshair chipRef={cursorChipRef} lineRef={cursorRef} />
			</div>
			<HoverCard
				cardRef={hoverCardRef}
				data={hover}
				tetherRef={hoverTetherRef}
			/>
		</div>
	);
}
