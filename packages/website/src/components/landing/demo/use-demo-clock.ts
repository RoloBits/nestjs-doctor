"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** A looping millisecond clock that only runs while the element is on a
 * visible tab, on screen, and not hidden by its window. It restarts after
 * the window was put away. Reduced motion pins it to `endMs`. */
export const useDemoClock = (totalMs: number, endMs: number) => {
	const ref = useRef<HTMLDivElement>(null);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
			setElapsed(endMs);
			return;
		}

		let frame: number | null = null;
		let last: number | null = null;
		let accumulated = 0;
		let onScreen = true;

		const tick = (now: number) => {
			frame = requestAnimationFrame(tick);
			const shown =
				ref.current?.checkVisibility?.({ visibilityProperty: true }) ?? true;
			if (!shown) {
				accumulated = 0;
				last = null;
				return;
			}
			if (last !== null) {
				accumulated = (accumulated + now - last) % totalMs;
			}
			last = now;
			setElapsed(accumulated);
		};
		const start = () => {
			if (frame === null) {
				last = null;
				frame = requestAnimationFrame(tick);
			}
		};
		const stop = () => {
			if (frame !== null) {
				cancelAnimationFrame(frame);
				frame = null;
			}
		};

		const sync = () => {
			if (onScreen && !document.hidden) {
				start();
			} else {
				stop();
			}
		};

		const observer = new IntersectionObserver(([entry]) => {
			onScreen = entry.isIntersecting;
			sync();
		});
		if (ref.current) {
			observer.observe(ref.current);
		}
		document.addEventListener("visibilitychange", sync);

		return () => {
			stop();
			observer.disconnect();
			document.removeEventListener("visibilitychange", sync);
		};
	}, [totalMs, endMs]);

	return { elapsed, ref };
};
