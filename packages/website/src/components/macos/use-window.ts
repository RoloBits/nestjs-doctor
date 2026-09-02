"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { type Cue, play } from "@/lib/sounds";
import type { WindowState } from "./terminal-window";
import { useWindowAnimations } from "./use-window-animations";

export type AnimationState =
	| "idle"
	| "minimizing"
	| "maximizing"
	| "restoring"
	| "closing";

type AnimationFn = (element: HTMLElement) => { finished: Promise<unknown> };

interface RunAnimationParams {
	animationFn: AnimationFn;
	animationState: AnimationState;
	busyRef: { current: boolean };
	element: HTMLElement | null;
	isMountedRef: { current: boolean };
	setAnimationState: (state: AnimationState) => void;
	setWindowState: (state: WindowState) => void;
	sound: Cue;
	successState: WindowState;
}

/** Plays one sound and one animation, then commits the state it was leading to. */
const runWindowAnimation = async ({
	animationFn,
	animationState,
	busyRef,
	element,
	isMountedRef,
	setAnimationState,
	setWindowState,
	sound,
	successState,
}: RunAnimationParams): Promise<void> => {
	if (!element || busyRef.current) {
		return;
	}
	busyRef.current = true;
	play(sound);
	try {
		if (prefersReducedMotion()) {
			setWindowState(successState);
			setAnimationState("idle");
			return;
		}

		setAnimationState(animationState);
		try {
			await animationFn(element).finished;
			if (isMountedRef.current) {
				setWindowState(successState);
				setAnimationState("idle");
			}
		} catch {
			// The animation was cancelled, or the component went away mid-flight.
			if (isMountedRef.current) {
				setAnimationState("idle");
			}
		}
	} finally {
		busyRef.current = false;
	}
};

/** Holds the window state and plays each animation before the state change it
 * commits. */
export const useWindow = () => {
	const [windowState, setWindowState] = useState<WindowState>("normal");
	const [animationState, setAnimationState] = useState<AnimationState>("idle");
	const windowRef = useRef<HTMLDivElement>(null);
	const isMountedRef = useRef(true);
	const busyRef = useRef(false);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const animations = useWindowAnimations();

	const handleClose = useCallback(
		() =>
			runWindowAnimation({
				animationFn: animations.closeWindow,
				animationState: "closing",
				busyRef,
				element: windowRef.current,
				isMountedRef,
				setAnimationState,
				setWindowState,
				sound: "close",
				successState: "closed",
			}),
		[animations]
	);

	const handleMinimize = useCallback(
		() =>
			runWindowAnimation({
				animationFn: animations.minimizeWindow,
				animationState: "minimizing",
				busyRef,
				element: windowRef.current,
				isMountedRef,
				setAnimationState,
				setWindowState,
				sound: "minimize",
				successState: "minimized",
			}),
		[animations]
	);

	const handleMaximize = useCallback(() => {
		const isFullscreen = windowState === "fullscreen";
		return runWindowAnimation({
			animationFn: animations.maximizeWindow,
			animationState: isFullscreen ? "restoring" : "maximizing",
			busyRef,
			element: windowRef.current,
			isMountedRef,
			setAnimationState,
			setWindowState,
			sound: isFullscreen ? "minimize" : "maximize",
			successState: isFullscreen ? "normal" : "fullscreen",
		});
	}, [animations, windowState]);

	const handleRestore = useCallback(() => {
		if (windowState === "minimized") {
			return runWindowAnimation({
				animationFn: animations.restoreWindow,
				animationState: "restoring",
				busyRef,
				element: windowRef.current,
				isMountedRef,
				setAnimationState,
				setWindowState,
				sound: "open",
				successState: "normal",
			});
		}
		if (windowState === "closed") {
			return runWindowAnimation({
				animationFn: animations.openWindow,
				animationState: "restoring",
				busyRef,
				element: windowRef.current,
				isMountedRef,
				setAnimationState,
				setWindowState,
				sound: "open",
				successState: "normal",
			});
		}
		return Promise.resolve();
	}, [animations, windowState]);

	return {
		animationState,
		handleClose,
		handleMaximize,
		handleMinimize,
		handleRestore,
		windowRef,
		windowState,
	};
};
