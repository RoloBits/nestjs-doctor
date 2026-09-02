"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** A looping millisecond clock that only runs while the element is on a
 * visible tab and on screen. Reduced motion pins it to `endMs`. */
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
			if (last !== null) {
				accumulated = (accumulated + now - last) % totalMs;
			}
			last = now;
			setElapsed(accumulated);
			frame = requestAnimationFrame(tick);
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

		const observer = new IntersectionObserver(([entry]) => {
			onScreen = entry.isIntersecting;
			if (onScreen && !document.hidden) {
				start();
			} else {
				stop();
			}
		});
		if (ref.current) {
			observer.observe(ref.current);
		}
		const onVisibility = () => {
			if (document.hidden) {
				stop();
			} else if (onScreen) {
				start();
			}
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			stop();
			observer.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [totalMs, endMs]);

	return { elapsed, ref };
};
