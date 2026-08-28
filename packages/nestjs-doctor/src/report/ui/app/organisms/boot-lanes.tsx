import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { timeAt } from "../lib/boot-pointer.js";
import {
	axisHtml,
	type BootTimeline,
	type BootWindow,
	clampWindow,
	pct,
	phaseLaneHtml,
	zoomWindow,
} from "../lib/boot-timeline.js";
import { useLatest } from "../lib/use-latest.js";

interface BootLanesProps {
	/** The axis track; shared so the owner can place its crosshair on it. */
	axisRef: RefObject<HTMLDivElement | null>;
	onWindowChange: (win: BootWindow) => void;
	timeline: BootTimeline;
	win: BootWindow;
}

type DragMode = "l" | "r" | "move" | "slide";

// The lanes over the tracks: the lifecycle phases carrying the viewport
// window, and the time axis. Wheel zooms, the window and the axis drag, and
// a plain click on a phase zooms to it.
export function BootLanes({
	axisRef,
	onWindowChange,
	timeline,
	win,
}: BootLanesProps) {
	const lanesRef = useRef<HTMLDivElement>(null);
	const overviewRef = useRef<HTMLDivElement>(null);
	const windowElRef = useRef<HTMLDivElement>(null);
	const timelineRef = useLatest(timeline);
	const winRef = useLatest(win);
	const changeRef = useLatest(onWindowChange);
	const phases = useMemo(() => phaseLaneHtml(timeline), [timeline]);

	// Repaint the string-rendered axis and move the window when the view moves.
	useLayoutEffect(() => {
		const full: BootWindow = { from: 0, to: timeline.maxMs };
		if (axisRef.current) {
			axisRef.current.innerHTML = axisHtml(win);
		}
		if (windowElRef.current) {
			const left = pct(win.from, full);
			windowElRef.current.style.left = `${left.toFixed(3)}%`;
			windowElRef.current.style.width = `${(pct(win.to, full) - left).toFixed(3)}%`;
		}
	}, [axisRef, timeline, win]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the handlers read the latest window, timeline, and callback through stable refs
	useEffect(() => {
		const lanes = lanesRef.current;
		const overview = overviewRef.current;
		const axis = axisRef.current;
		if (!(lanes && overview && axis)) {
			return;
		}
		const detach: Array<() => void> = [];
		const on = <K extends keyof HTMLElementEventMap>(
			el: HTMLElement,
			type: K,
			handler: (ev: HTMLElementEventMap[K]) => void,
			options?: AddEventListenerOptions
		) => {
			el.addEventListener(type, handler, options);
			detach.push(() => el.removeEventListener(type, handler, options));
		};
		const drag = (onMove: (ev: MouseEvent) => void) => {
			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		};
		const setWin = (next: BootWindow) => changeRef.current(next);

		on(
			lanes,
			"wheel",
			(ev) => {
				const t = timelineRef.current;
				ev.preventDefault();
				const factor = ev.deltaY > 0 ? 1.25 : 0.8;
				const anchor = timeAt(ev.clientX, axis, winRef.current);
				setWin(zoomWindow(winRef.current, t.maxMs, factor, anchor));
			},
			{ passive: false }
		);

		let moved = false;
		on(overview, "mousedown", (ev) => {
			const t = timelineRef.current;
			ev.preventDefault();
			moved = false;
			const rect = overview.getBoundingClientRect();
			const toT = (clientX: number) =>
				Math.max(
					0,
					Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1))
				) * t.maxMs;
			const target = ev.target as Element;
			let mode: DragMode = "slide";
			if (target.classList.contains("boot-handle-l")) {
				mode = "l";
			} else if (target.classList.contains("boot-handle-r")) {
				mode = "r";
			} else if (target.closest(".boot-minimap-window")) {
				mode = "move";
			}
			const startWin = { ...winRef.current };
			const startX = ev.clientX;
			const minW = t.maxMs / 5000;
			drag((mv) => {
				if (!moved && Math.abs(mv.clientX - startX) <= 3) {
					return;
				}
				moved = true;
				if (mode === "slide") {
					const center = toT(mv.clientX);
					const w = startWin.to - startWin.from;
					setWin(
						clampWindow({ from: center - w / 2, to: center + w / 2 }, t.maxMs)
					);
					return;
				}
				const dt = toT(mv.clientX) - toT(startX);
				if (mode === "move") {
					setWin(
						clampWindow(
							{ from: startWin.from + dt, to: startWin.to + dt },
							t.maxMs
						)
					);
				} else if (mode === "l") {
					setWin(
						clampWindow(
							{
								from: Math.min(startWin.from + dt, startWin.to - minW),
								to: startWin.to,
							},
							t.maxMs
						)
					);
				} else {
					setWin(
						clampWindow(
							{
								from: startWin.from,
								to: Math.max(startWin.to + dt, startWin.from + minW),
							},
							t.maxMs
						)
					);
				}
			});
		});
		on(overview, "click", (ev) => {
			const t = timelineRef.current;
			const seg = (ev.target as Element).closest(".boot-phase");
			if (moved || !seg) {
				return;
			}
			const from = Number.parseFloat(seg.getAttribute("data-from") ?? "0");
			const to = Number.parseFloat(seg.getAttribute("data-to") ?? "0");
			if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) {
				return;
			}
			const pad = (to - from) * 0.05;
			setWin(clampWindow({ from: from - pad, to: to + pad }, t.maxMs));
		});

		on(axis, "mousedown", (ev) => {
			const t = timelineRef.current;
			ev.preventDefault();
			const rect = axis.getBoundingClientRect();
			const startWin = { ...winRef.current };
			const msPerPx = (startWin.to - startWin.from) / Math.max(rect.width, 1);
			const startX = ev.clientX;
			drag((mv) => {
				const dt = (mv.clientX - startX) * msPerPx;
				setWin(
					clampWindow(
						{ from: startWin.from - dt, to: startWin.to - dt },
						t.maxMs
					)
				);
			});
		});

		return () => {
			for (const off of detach) {
				off();
			}
		};
	}, []);

	return (
		<div className="boot-lanes" ref={lanesRef}>
			<div className="boot-lane boot-overview" ref={overviewRef}>
				<span
					className="boot-phases"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: phases come from the tested boot-timeline module
					dangerouslySetInnerHTML={{ __html: phases }}
				/>
				<div className="boot-minimap-window" ref={windowElRef}>
					<span className="boot-handle boot-handle-l" />
					<span className="boot-handle boot-handle-r" />
				</div>
			</div>
			<div className="boot-lane boot-axis" ref={axisRef} />
		</div>
	);
}
