import type { CSSProperties, ReactNode } from "react";
import { useEffect } from "react";

export function Modal({
	children,
	onClose,
	overlayId,
	panelClasses,
	panelId,
	panelStyle,
}: {
	children: ReactNode;
	onClose?: () => void;
	overlayId?: string;
	panelClasses?: string;
	panelId?: string;
	panelStyle?: CSSProperties;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose?.();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);
	const panel = ["modal-panel", panelClasses].filter(Boolean).join(" ");
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop closes, as in the report's CSS
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: clicking the backdrop closes, as in the report's CSS
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes the overlay
		<div
			className="modal-overlay"
			id={overlayId}
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose?.();
				}
			}}
		>
			<div className={panel} id={panelId} style={panelStyle}>
				{children}
			</div>
		</div>
	);
}
