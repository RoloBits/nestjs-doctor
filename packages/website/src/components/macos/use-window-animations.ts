"use client";

import { animate } from "motion";
import { useCallback } from "react";

/** The five window animations, keyframe for keyframe as macOS plays them. */
export const useWindowAnimations = () => {
	const minimizeWindow = useCallback(
		(element: HTMLElement) =>
			animate(
				element,
				{
					transform: [
						"scale(1) translateY(0px) rotateX(0deg)",
						"scale(0.8) translateY(40px) rotateX(-2deg)",
						"scale(0.6) translateY(100px) rotateX(-3deg)",
						"scale(0.4) translateY(180px) rotateX(-4deg)",
						"scale(0.25) translateY(280px) rotateX(-3deg)",
						"scale(0.15) translateY(360px) rotateX(-1deg)",
						"scale(0.08) translateY(420px) rotateX(0deg)",
					],
					opacity: [1, 0.95, 0.9, 0.8, 0.5, 0.25, 0],
					filter: ["blur(0px)", "blur(0px)", "blur(2px)", "blur(4px)"],
				},
				{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }
			),
		[]
	);

	const restoreWindow = useCallback(
		(element: HTMLElement) =>
			animate(
				element,
				{
					transform: [
						"scale(0.08) translateY(420px) rotateX(0deg)",
						"scale(0.15) translateY(360px) rotateX(-1deg)",
						"scale(0.25) translateY(280px) rotateX(-3deg)",
						"scale(0.4) translateY(180px) rotateX(-4deg)",
						"scale(0.6) translateY(100px) rotateX(-3deg)",
						"scale(0.8) translateY(40px) rotateX(-2deg)",
						"scale(1.02) translateY(-5px) rotateX(0deg)",
						"scale(1) translateY(0px) rotateX(0deg)",
					],
					opacity: [0, 0.25, 0.5, 0.8, 0.9, 0.95, 1, 1],
					filter: ["blur(4px)", "blur(2px)", "blur(0px)", "blur(0px)"],
				},
				{ ease: [0.34, 1.56, 0.64, 1], duration: 0.3 }
			),
		[]
	);

	const closeWindow = useCallback(
		(element: HTMLElement) =>
			animate(
				element,
				{
					transform: ["scale(1)", "scale(0.94)", "scale(0.87)", "scale(0.8)"],
					opacity: [1, 0.7, 0.3, 0],
					filter: ["blur(0px)", "blur(1px)", "blur(2px)"],
				},
				{ ease: [0.25, 0.46, 0.45, 0.94], duration: 0.2 }
			),
		[]
	);

	const openWindow = useCallback(
		(element: HTMLElement) =>
			animate(
				element,
				{
					transform: [
						"scale(0.8)",
						"scale(0.87)",
						"scale(0.94)",
						"scale(1.01)",
						"scale(1)",
					],
					opacity: [0, 0.3, 0.7, 1, 1],
					filter: ["blur(2px)", "blur(1px)", "blur(0px)", "blur(0px)"],
				},
				{ ease: [0.34, 1.56, 0.64, 1], duration: 0.2 }
			),
		[]
	);

	const maximizeWindow = useCallback(
		(element: HTMLElement) =>
			animate(
				element,
				{ transform: ["scale(1)", "scale(1.015)", "scale(1)"] },
				{ ease: [0.25, 0.46, 0.45, 0.94], duration: 0.25 }
			),
		[]
	);

	return {
		closeWindow,
		maximizeWindow,
		minimizeWindow,
		openWindow,
		restoreWindow,
	};
};
