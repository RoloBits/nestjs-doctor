"use client";

import type { ReactNode } from "react";
import { Dock } from "./dock";
import { MenuBar } from "./menu-bar";
import { ReopenCard } from "./reopen";
import { TerminalWindow } from "./terminal-window";
import { useWindow } from "./use-window";
import { MacOSWallpaper } from "./wallpaper";

const STAGE_CLASS =
	"relative flex min-h-0 flex-1 items-center-safe justify-center overflow-auto p-4 sm:p-6";
const WINDOW_BASE_CLASS =
	"transition-[max-width] duration-300 motion-reduce:transition-none";
const WINDOW_NORMAL_CLASS = "w-full max-w-3xl";
const WINDOW_FULLSCREEN_CLASS = "w-full max-w-none self-stretch";

/** A macOS desktop: wallpaper, menu bar, and one terminal window holding the
 * children. The window stays mounted while minimised or closed. */
export const Desktop = ({
	children,
	reopenLabel,
	section,
	title,
}: {
	children: ReactNode;
	reopenLabel: string;
	section: string;
	title: string;
}) => {
	const {
		animationState,
		handleClose,
		handleMaximize,
		handleMinimize,
		handleRestore,
		windowRef,
		windowState,
	} = useWindow();

	const isIdle = animationState === "idle";
	const isAway = windowState === "minimized" || windowState === "closed";
	const isPutAway = isAway && isIdle;
	const isFullscreen = windowState === "fullscreen";

	const windowClassName = `${WINDOW_BASE_CLASS} ${isFullscreen ? WINDOW_FULLSCREEN_CLASS : WINDOW_NORMAL_CLASS}`;

	return (
		<section className="relative flex h-dvh flex-col overflow-hidden font-mono">
			<MacOSWallpaper className="absolute inset-0 h-full w-full" />
			<div className="absolute inset-0 bg-black/30" />

			<div className="relative z-10 flex min-h-0 flex-1 flex-col">
				<MenuBar section={section} />

				<div className={STAGE_CLASS} style={{ perspective: "1000px" }}>
					<div
						className={windowClassName}
						ref={windowRef}
						style={{
							visibility: isPutAway ? "hidden" : "visible",
							pointerEvents: isPutAway ? "none" : "auto",
						}}
					>
						<TerminalWindow
							busy={!isIdle}
							className="h-full"
							onClose={handleClose}
							onMaximize={handleMaximize}
							onMinimize={handleMinimize}
							title={title}
							windowState={windowState}
						>
							{children}
						</TerminalWindow>
					</div>

					{windowState === "closed" && isIdle ? (
						<div className="absolute inset-0 z-20 flex items-center justify-center">
							<ReopenCard label={reopenLabel} onReopen={handleRestore} />
						</div>
					) : null}

					{windowState === "minimized" && isIdle ? (
						<Dock onRestore={handleRestore} title={title} />
					) : null}
				</div>
			</div>
		</section>
	);
};
