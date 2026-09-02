import type { ReactNode } from "react";

export type WindowState = "normal" | "minimized" | "closed" | "fullscreen";

const FRAME_CLASS =
	"flex flex-col overflow-hidden rounded-[10px] border border-white/10 bg-[#0a0a0a] shadow-2xl";
const BAR_CLASS =
	"flex shrink-0 items-center gap-2 border-white/10 border-b bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] px-4 py-2.5";
const LIGHT_CLASS =
	"relative flex h-3 w-3 min-w-0 cursor-pointer items-center justify-center rounded-full p-0 shadow-sm transition-colors duration-100 aria-disabled:cursor-default";
const GLYPH_CLASS =
	"h-2 w-2 opacity-0 transition-opacity duration-100 group-hover:opacity-100";

const CLOSE_CLASS = "bg-[#FF5F57] hover:bg-[#FF3B30] active:bg-[#E5352D]";
const MINIMIZE_CLASS = "bg-[#FFBD2E] hover:bg-[#F5A623] active:bg-[#E09620]";
const MAXIMIZE_CLASS = "bg-[#28CA41] hover:bg-[#24B33A] active:bg-[#1FA033]";

/** A traffic light; clicks are ignored while busy. */
const TrafficLight = ({
	busy,
	glyph,
	glyphColor,
	label,
	onClick,
	tone,
}: {
	busy: boolean;
	glyph: ReactNode;
	glyphColor: string;
	label: string;
	onClick: () => void;
	tone: string;
}) => {
	const className = `${LIGHT_CLASS} ${tone}`;
	const svgClassName = `${GLYPH_CLASS} ${glyphColor}`;
	return (
		<button
			aria-disabled={busy}
			aria-label={label}
			className={className}
			data-cuelume-press={busy ? undefined : "press"}
			data-cuelume-release={busy ? undefined : "release"}
			onClick={() => {
				if (!busy) {
					onClick();
				}
			}}
			tabIndex={busy ? -1 : undefined}
			type="button"
		>
			<svg
				aria-hidden="true"
				className={svgClassName}
				fill="currentColor"
				viewBox="0 0 12 12"
			>
				{glyph}
			</svg>
		</button>
	);
};

/**
 * A Terminal.app window: traffic lights, a centred title, and a black body.
 * The chrome is decoration; the caller owns everything inside.
 */
export const TerminalWindow = ({
	busy,
	children,
	className = "",
	onClose,
	onMaximize,
	onMinimize,
	title,
	windowState,
}: {
	busy: boolean;
	children: ReactNode;
	className?: string;
	onClose: () => void;
	onMaximize: () => void;
	onMinimize: () => void;
	title: string;
	windowState: WindowState;
}) => {
	const frameClassName = `${FRAME_CLASS} ${className}`;
	const isFullscreen = windowState === "fullscreen";
	return (
		<div className={frameClassName}>
			<div className={BAR_CLASS}>
				<div className="group flex items-center gap-2">
					<TrafficLight
						busy={busy}
						glyph={
							<path
								d="M3.5 3.5l5 5M8.5 3.5l-5 5"
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeWidth="1.5"
							/>
						}
						glyphColor="text-[#4D0000]"
						label="Close window"
						onClick={onClose}
						tone={CLOSE_CLASS}
					/>
					<TrafficLight
						busy={busy}
						glyph={
							<path
								d="M2.5 6h7"
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeWidth="1.5"
							/>
						}
						glyphColor="text-[#995700]"
						label="Minimize window"
						onClick={onMinimize}
						tone={MINIMIZE_CLASS}
					/>
					<TrafficLight
						busy={busy}
						glyph={
							<path
								d={
									isFullscreen
										? "M3 3l2.5 2.5M9 9l-2.5-2.5M3 9l2.5-2.5M9 3l-2.5 2.5"
										: "M2 2l3 3M10 10l-3-3M2 10l3-3M10 2l-3 3"
								}
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeWidth="1.2"
							/>
						}
						glyphColor="text-[#006500]"
						label={isFullscreen ? "Restore window" : "Maximize window"}
						onClick={onMaximize}
						tone={MAXIMIZE_CLASS}
					/>
				</div>

				<div className="flex flex-1 justify-center">
					<span className="max-w-[70%] truncate text-[12px] text-white/70">
						{title}
					</span>
				</div>

				<div className="w-[52px]" />
			</div>

			<div className="min-h-0 flex-1 overflow-auto">{children}</div>
		</div>
	);
};
